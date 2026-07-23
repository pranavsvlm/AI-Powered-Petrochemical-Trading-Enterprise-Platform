import type {
  TenantScopedPrismaClient,
  Document,
  DocumentVersion,
  DocumentFolder,
  DocumentCategory,
  DocumentTag,
  DocumentPermission,
  DocumentApproval,
  DocumentStatus,
} from '@platform/database';

export interface CreateDocumentInput {
  companyId: string;
  module: string;
  entityType: string;
  entityId?: string;
  title: string;
  description?: string;
  folderId?: string;
  categoryId?: string;
  ownerUserId: string;
  retentionPolicyName?: string;
  retentionExpiresAt?: Date;
}

export interface CreateVersionInput {
  documentId: string;
  version: number;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256Hash: string;
  uploadedByUserId: string;
}

/**
 * Prisma-backed repository for the Document aggregate (doc 21). All queries run through
 * TenantScopedPrismaClient, so the tenant-isolation extension enforces company_id scoping —
 * see packages/database/src/tenant-extension.ts.
 */
export class DocumentRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  createWithFirstVersion(
    input: CreateDocumentInput,
    version: Omit<CreateVersionInput, 'documentId' | 'version'>,
  ): Promise<Document & { versions: DocumentVersion[] }> {
    return this.db.document.create({
      data: {
        companyId: input.companyId,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        description: input.description,
        folderId: input.folderId,
        categoryId: input.categoryId,
        ownerUserId: input.ownerUserId,
        retentionPolicyName: input.retentionPolicyName,
        retentionExpiresAt: input.retentionExpiresAt,
        versions: {
          create: {
            version: 1,
            storageKey: version.storageKey,
            filename: version.filename,
            contentType: version.contentType,
            sizeBytes: version.sizeBytes,
            sha256Hash: version.sha256Hash,
            uploadedByUserId: version.uploadedByUserId,
          },
        },
      },
      include: { versions: true },
    });
  }

  findById(id: string): Promise<(Document & { versions: DocumentVersion[] }) | null> {
    return this.db.document.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
  }

  list(filters: {
    companyId: string;
    status?: DocumentStatus;
    folderId?: string;
    categoryId?: string;
  }): Promise<Document[]> {
    return this.db.document.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        folderId: filters.folderId,
        categoryId: filters.categoryId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: DocumentStatus): Promise<Document> {
    return this.db.document.update({ where: { id }, data: { status } });
  }

  update(
    id: string,
    data: Partial<Pick<Document, 'title' | 'description' | 'folderId' | 'categoryId'>>,
  ): Promise<Document> {
    return this.db.document.update({ where: { id }, data });
  }

  setRetention(
    id: string,
    retentionPolicyName: string,
    retentionExpiresAt: Date,
  ): Promise<Document> {
    return this.db.document.update({
      where: { id },
      data: { retentionPolicyName, retentionExpiresAt },
    });
  }

  findDocumentsPastRetention(companyId: string, now: Date): Promise<Document[]> {
    return this.db.document.findMany({
      where: {
        companyId,
        status: { not: 'ARCHIVED' as DocumentStatus },
        retentionExpiresAt: { not: null, lte: now },
      },
    });
  }

  addVersion(input: CreateVersionInput): Promise<DocumentVersion> {
    return this.db.documentVersion.create({ data: input });
  }

  listVersions(documentId: string): Promise<DocumentVersion[]> {
    return this.db.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: 'desc' },
    });
  }

  getLatestVersion(documentId: string): Promise<DocumentVersion | null> {
    return this.db.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });
  }

  getVersion(documentId: string, version: number): Promise<DocumentVersion | null> {
    return this.db.documentVersion.findUnique({
      where: { documentId_version: { documentId, version } },
    });
  }

  /**
   * Exact-duplicate lookup within a company — joins through Document so the search stays
   * tenant-scoped even though DocumentVersion itself has no company_id column. See
   * docs/DOMAIN_MODEL_PHASE3.md §7 (warn, don't block).
   */
  findExistingVersionByHash(
    companyId: string,
    sha256Hash: string,
  ): Promise<DocumentVersion | null> {
    return this.db.documentVersion.findFirst({
      where: { sha256Hash, document: { companyId } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Folders

  createFolder(companyId: string, name: string, parentId?: string): Promise<DocumentFolder> {
    return this.db.documentFolder.create({ data: { companyId, name, parentId } });
  }

  listFolders(companyId: string): Promise<DocumentFolder[]> {
    return this.db.documentFolder.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  // Categories

  createCategory(companyId: string, name: string): Promise<DocumentCategory> {
    return this.db.documentCategory.create({ data: { companyId, name } });
  }

  listCategories(companyId: string): Promise<DocumentCategory[]> {
    return this.db.documentCategory.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  // Tags

  createTag(companyId: string, name: string): Promise<DocumentTag> {
    return this.db.documentTag.create({ data: { companyId, name } });
  }

  listTags(companyId: string): Promise<DocumentTag[]> {
    return this.db.documentTag.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  assignTag(documentId: string, tagId: string): Promise<void> {
    return this.db.documentTagAssignment
      .upsert({
        where: { documentId_tagId: { documentId, tagId } },
        create: { documentId, tagId },
        update: {},
      })
      .then(() => undefined);
  }

  // Permissions

  grantPermission(
    documentId: string,
    action: DocumentPermission['action'],
    target: { roleId?: string; userId?: string },
  ): Promise<DocumentPermission> {
    return this.db.documentPermission.create({
      data: { documentId, action, roleId: target.roleId, userId: target.userId },
    });
  }

  listPermissions(documentId: string): Promise<DocumentPermission[]> {
    return this.db.documentPermission.findMany({ where: { documentId } });
  }

  // Approvals

  createApproval(input: {
    documentId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<DocumentApproval> {
    return this.db.documentApproval.create({ data: input });
  }

  decideApproval(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<DocumentApproval> {
    return this.db.documentApproval.update({
      where: { id },
      data: { status, decidedAt: new Date(), comment },
    });
  }

  findApproval(id: string): Promise<DocumentApproval | null> {
    return this.db.documentApproval.findUnique({ where: { id } });
  }

  listApprovals(documentId: string): Promise<DocumentApproval[]> {
    return this.db.documentApproval.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
