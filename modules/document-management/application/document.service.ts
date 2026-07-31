import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  Document,
  DocumentVersion,
  DocumentApproval,
} from '@platform/database';
import type { StoragePort, StorageModule, OcrProvider, OcrResult } from '@platform/storage';
import { buildStorageKey } from '@platform/storage';
import type { SearchService, SearchMode } from '@platform/search';
import { computeSha256 } from '../domain/document-hash';
import { computeRetentionExpiry, isPastRetention, type RetentionPolicy } from '../domain/retention';
import { DocumentRepository } from '../infrastructure/document.repository';

export interface DocumentAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

export interface DocumentEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Narrow slice of RuleEvaluationService's public API — see docs/DOMAIN_MODEL_PHASE3.md §6. */
export interface ApprovalEvaluator {
  evaluateApproval(
    companyId: string,
    module: string,
    attributes: Record<string, unknown>,
  ): Promise<{
    approvers: Array<{ ruleId: string; [key: string]: unknown }>;
    matchedRuleIds: string[];
  }>;
}

export interface UploadDocumentInput {
  companyId: string;
  module: StorageModule;
  entityType: string;
  entityId?: string;
  title: string;
  description?: string;
  folderId?: string;
  categoryId?: string;
  ownerUserId: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
  retentionPolicy?: RetentionPolicy;
  ipAddress?: string | null;
}

export interface UploadDocumentResult {
  document: Document & { versions: DocumentVersion[] };
  possibleDuplicateOf?: { documentId: string; versionId: string };
}

/**
 * Application-layer use cases for the Document aggregate (doc 21). Follows the same
 * lifecycle as docs/DOMAIN_MODEL_PHASE3.md: Create -> Upload -> Version Control -> Approval
 * (delegated to the Rules Engine, never reimplemented here) -> Published -> Archived ->
 * Retention/Disposal.
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly repo: DocumentRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly storage: StoragePort,
    private readonly searchService: SearchService,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: DocumentEventPublisher,
    private readonly audit: DocumentAuditWriter,
    private readonly ocrProvider: OcrProvider,
  ) {
    this.repo = new DocumentRepository(db);
  }

  async upload(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const hash = computeSha256(input.buffer);

    // Exact-duplicate detection — warn, don't block (docs/DOMAIN_MODEL_PHASE3.md §7).
    const existing = await this.repo.findExistingVersionByHash(input.companyId, hash);

    const documentId = randomUUID();
    const storageKey = buildStorageKey(
      input.companyId,
      input.module,
      'document',
      documentId,
      input.filename,
    );
    await this.storage.upload(storageKey, input.buffer, input.contentType);

    const retentionExpiresAt = input.retentionPolicy
      ? computeRetentionExpiry(new Date(), input.retentionPolicy)
      : undefined;

    const document = await this.db.document.create({
      data: {
        id: documentId,
        companyId: input.companyId,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        description: input.description,
        folderId: input.folderId,
        categoryId: input.categoryId,
        ownerUserId: input.ownerUserId,
        retentionPolicyName: input.retentionPolicy?.name,
        retentionExpiresAt,
        versions: {
          create: {
            version: 1,
            storageKey,
            filename: input.filename,
            contentType: input.contentType,
            sizeBytes: input.buffer.byteLength,
            sha256Hash: hash,
            uploadedByUserId: input.ownerUserId,
          },
        },
      },
      include: { versions: true },
    });

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.ownerUserId,
      eventType: AuditEventType.DOCUMENT_UPLOADED,
      entityType: 'Document',
      entityId: document.id,
      after: { title: input.title, module: input.module },
      ipAddress: input.ipAddress ?? null,
    });
    await this.events.publish(
      'DocumentUploaded',
      input.companyId,
      { documentId: document.id, module: input.module, title: input.title },
      'document-management',
    );
    this.logger.log(`Document uploaded: ${document.id} (${input.filename})`);

    return {
      document,
      possibleDuplicateOf: existing
        ? { documentId: existing.documentId, versionId: existing.id }
        : undefined,
    };
  }

  async addVersion(
    documentId: string,
    buffer: Buffer,
    contentType: string,
    filename: string,
    uploadedByUserId: string,
    ipAddress?: string | null,
  ): Promise<DocumentVersion> {
    const document = await this.getById(documentId);
    const latest = await this.repo.getLatestVersion(documentId);
    const nextVersion = (latest?.version ?? 0) + 1;
    const hash = computeSha256(buffer);
    const storageKey = buildStorageKey(
      document.companyId,
      document.module as StorageModule,
      'document',
      documentId,
      filename,
    );
    await this.storage.upload(storageKey, buffer, contentType);

    const version = await this.repo.addVersion({
      documentId,
      version: nextVersion,
      storageKey,
      filename,
      contentType,
      sizeBytes: buffer.byteLength,
      sha256Hash: hash,
      uploadedByUserId,
    });

    await this.audit.record({
      companyId: document.companyId,
      actorUserId: uploadedByUserId,
      eventType: AuditEventType.DOCUMENT_VERSION_CREATED,
      entityType: 'Document',
      entityId: documentId,
      after: { version: nextVersion },
      ipAddress: ipAddress ?? null,
    });
    return version;
  }

  /** Creates a new version that copies an old version's content — never mutates history. */
  async restoreVersion(
    documentId: string,
    versionNumber: number,
    actorUserId: string,
  ): Promise<DocumentVersion> {
    const target = await this.repo.getVersion(documentId, versionNumber);
    if (!target) throw new NotFoundException(`Version ${versionNumber} not found.`);

    const { body } = await this.storage.download(target.storageKey);
    return this.addVersion(documentId, body, target.contentType, target.filename, actorUserId);
  }

  async getById(id: string): Promise<Document & { versions: DocumentVersion[] }> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new NotFoundException('Document not found.');
    return doc;
  }

  /** OCR seam (doc 21) — see docs/DOMAIN_MODEL_PHASE6.md §9. Runs against the latest version's stored bytes; does not persist the result or feed it into search indexing. */
  async extractText(documentId: string): Promise<OcrResult> {
    const latest = await this.repo.getLatestVersion(documentId);
    if (!latest) throw new NotFoundException('Document has no versions to run OCR against.');
    const { body } = await this.storage.download(latest.storageKey);
    return this.ocrProvider.extractText(body, latest.contentType);
  }

  async updateMetadata(
    id: string,
    data: Partial<Pick<Document, 'title' | 'description' | 'folderId' | 'categoryId'>>,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Document> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.DOCUMENT_UPDATED,
      entityType: 'Document',
      entityId: id,
      before: { title: before.title, folderId: before.folderId, categoryId: before.categoryId },
      after: { title: updated.title, folderId: updated.folderId, categoryId: updated.categoryId },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  list(filters: {
    companyId: string;
    status?: Document['status'];
    folderId?: string;
    categoryId?: string;
  }): Promise<Document[]> {
    return this.repo.list(filters);
  }

  async download(
    documentId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<{ url: string; filename: string }> {
    const document = await this.getById(documentId);
    const latest = document.versions[0];
    if (!latest) throw new NotFoundException('Document has no versions.');
    const url = await this.storage.getSignedUrl(latest.storageKey, 3600);

    await this.audit.record({
      companyId: document.companyId,
      actorUserId,
      eventType: AuditEventType.DOCUMENT_DOWNLOADED,
      entityType: 'Document',
      entityId: documentId,
      ipAddress: ipAddress ?? null,
    });
    return { url, filename: latest.filename };
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    documentId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<DocumentApproval[]> {
    const document = await this.getById(documentId);
    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      document.companyId,
      'documents',
      { ...attributes, documentId, module: document.module },
    );

    await this.repo.updateStatus(documentId, 'PENDING_APPROVAL');

    if (approvers.length === 0) {
      // No approval rule matched — auto-publish.
      await this.repo.updateStatus(documentId, 'PUBLISHED');
      return [];
    }

    const approvals = await Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          documentId,
          approverRoleId: typeof a.approverRoleId === 'string' ? a.approverRoleId : undefined,
          approverUserId: typeof a.approverUserId === 'string' ? a.approverUserId : undefined,
        }),
      ),
    );
    this.logger.log(
      `Approval requested for document ${documentId}: ${approvals.length} approver(s)`,
    );
    return approvals;
  }

  async decideApproval(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    comment?: string,
    ipAddress?: string | null,
  ): Promise<DocumentApproval> {
    const approval = await this.repo.findApproval(approvalId);
    if (!approval) throw new NotFoundException('Approval not found.');
    const updated = await this.repo.decideApproval(approvalId, decision, comment);
    const document = await this.getById(approval.documentId);

    if (decision === 'APPROVED') {
      await this.repo.updateStatus(approval.documentId, 'PUBLISHED');
      await this.audit.record({
        companyId: document.companyId,
        actorUserId,
        eventType: AuditEventType.DOCUMENT_APPROVED,
        entityType: 'Document',
        entityId: approval.documentId,
        ipAddress: ipAddress ?? null,
      });
      await this.events.publish(
        'DocumentApproved',
        document.companyId,
        { documentId: approval.documentId },
        'document-management',
      );
    } else {
      await this.repo.updateStatus(approval.documentId, 'DRAFT');
      await this.audit.record({
        companyId: document.companyId,
        actorUserId,
        eventType: AuditEventType.DOCUMENT_REJECTED,
        entityType: 'Document',
        entityId: approval.documentId,
        ipAddress: ipAddress ?? null,
      });
    }
    return updated;
  }

  async archive(
    documentId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Document> {
    const document = await this.getById(documentId);
    const updated = await this.repo.updateStatus(documentId, 'ARCHIVED');
    await this.audit.record({
      companyId: document.companyId,
      actorUserId,
      eventType: AuditEventType.DOCUMENT_ARCHIVED,
      entityType: 'Document',
      entityId: documentId,
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      'DocumentArchived',
      document.companyId,
      { documentId },
      'document-management',
    );
    return updated;
  }

  async search(
    companyId: string,
    query: string,
    filters: { limit?: number; offset?: number } = {},
    mode: SearchMode = 'fulltext',
  ): Promise<Document[]> {
    const hits = await this.searchService.search(companyId, query, filters, mode);
    if (hits.length === 0) return [];
    const ids = hits.map((h) => h.id);
    const documents = await this.db.document.findMany({ where: { id: { in: ids } } });
    const byId = new Map(documents.map((d) => [d.id, d]));
    return ids.map((id) => byId.get(id)).filter((d): d is Document => !!d);
  }

  /**
   * Flags/archives documents past their retention date for the given, already tenant-scoped
   * company — called by the scheduler (docs/DOMAIN_MODEL_PHASE3.md §9), which is responsible
   * for iterating companies and binding tenant context per company.
   */
  async checkRetention(companyId: string, now: Date = new Date()): Promise<number> {
    const candidates = await this.repo.findDocumentsPastRetention(companyId, now);
    const overdue = candidates.filter((d) => isPastRetention(d.retentionExpiresAt, now));
    for (const doc of overdue) {
      await this.archive(doc.id, doc.ownerUserId);
    }
    return overdue.length;
  }

  // Folders / categories / tags — thin passthroughs, tenant-scoped via TenantScopedPrismaClient.

  createFolder(companyId: string, name: string, parentId?: string) {
    return this.repo.createFolder(companyId, name, parentId);
  }

  listFolders(companyId: string) {
    return this.repo.listFolders(companyId);
  }

  createCategory(companyId: string, name: string) {
    return this.repo.createCategory(companyId, name);
  }

  listCategories(companyId: string) {
    return this.repo.listCategories(companyId);
  }

  createTag(companyId: string, name: string) {
    return this.repo.createTag(companyId, name);
  }

  listTags(companyId: string) {
    return this.repo.listTags(companyId);
  }

  assignTag(documentId: string, tagId: string) {
    return this.repo.assignTag(documentId, tagId);
  }
}
