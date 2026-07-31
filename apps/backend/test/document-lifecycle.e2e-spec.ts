/**
 * Full Document Management lifecycle (doc 21) against real Postgres + Redis + MinIO — see
 * docs/DOMAIN_MODEL_PHASE3.md. Exercises the actual composed DocumentService (same wiring as
 * apps/backend/src/modules/documents/documents.module.ts), not mocks, per the lesson from
 * Phase 2's postmortem: mocked-only tests hid two real bugs (a stale-transaction-object bug
 * and a silent idempotency-dedup no-op) that only surfaced under live infra.
 *
 * Requires DATABASE_URL, REDIS_URL, and MinIO env vars (STORAGE_PROVIDER=minio plus
 * MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET) to point at the services in
 * docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { getSharedStorage } from '@platform/storage';
import {
  SearchService,
  DocumentFullTextSearchService,
  PgVectorSearchProvider,
} from '@platform/search';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleManagementService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider, RealOcrProvider } from '@platform/ai';
import { DocumentService } from '@modules/document-management';
import { buildAiRouter, buildPromptTemplateService } from '../src/common/ai/ai-factory';

const db = getPrismaClient();
const rawDb = new PrismaClient();

// `fn` MUST be awaited *inside* the bound callback (`async () => await fn()`, not a bare
// `fn` reference) — TenantContextStore.run()/AsyncLocalStorage only keeps the tenant context
// bound through the synchronous portion plus any internally-awaited continuation, and
// Prisma's lazy PrismaPromise.then() fires later otherwise. See the doc comment on
// withoutTenantScope() in packages/database/src/tenant-extension.ts for the full explanation
// of this exact bug, previously found in packages/event-bus and modules/company.
function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('Document Management lifecycle (live Postgres + Redis + MinIO)', () => {
  let companyId: string;
  let userId: string;
  let service: DocumentService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;
  const eventBus = new RedisStreamsEventBus();

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-DOC-${Date.now()}`,
          legalName: 'Doc Lifecycle Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Doc',
          lastName: 'Tester',
          email: `doc-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const storage = getSharedStorage();
    const aiRouter = buildAiRouter(db);
    const prompts = buildPromptTemplateService(db);
    const searchService = new SearchService(
      new DocumentFullTextSearchService(db),
      new PgVectorSearchProvider(db, aiRouter),
    );
    const ruleRepository = new RuleRepository(db);
    const ruleActionExecutor = new RuleActionExecutor({
      eventBus,
      aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
    });
    const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
      new LegacyApprovalRuleSource(db),
      new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
    ]);

    auditEntries = [];
    const audit = {
      record: async (entry: { eventType: string; entityId: string | null }) => {
        auditEntries.push(entry);
      },
    };

    service = new DocumentService(
      db,
      storage,
      searchService,
      approvalEvaluator,
      eventBus,
      audit,
      new RealOcrProvider(aiRouter, prompts),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.documentAudit.deleteMany({ where: { document: { companyId } } });
      await rawDb.documentApproval.deleteMany({ where: { document: { companyId } } });
      await rawDb.documentTagAssignment.deleteMany({ where: { document: { companyId } } });
      await rawDb.documentVersion.deleteMany({ where: { document: { companyId } } });
      await rawDb.document.deleteMany({ where: { companyId } });
      await rawDb.documentFolder.deleteMany({ where: { companyId } });
      await rawDb.documentCategory.deleteMany({ where: { companyId } });
      await rawDb.documentTag.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  it('uploads a document, computes its hash, and persists version 1', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Q3 Invoice',
        description: 'Contains shipment and payment terms',
        ownerUserId: userId,
        buffer: Buffer.from('unique content for lifecycle test'),
        contentType: 'text/plain',
        filename: 'q3-invoice.txt',
      }),
    );

    expect(result.document.versions).toHaveLength(1);
    expect(result.document.versions[0].version).toBe(1);
    expect(result.possibleDuplicateOf).toBeUndefined();
    expect(auditEntries.some((e) => e.eventType === 'DOCUMENT_UPLOADED')).toBe(true);
  });

  it('warns (does not block) on an exact-hash duplicate upload', async () => {
    const first = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Original',
        ownerUserId: userId,
        buffer: Buffer.from('identical duplicate-check content'),
        contentType: 'text/plain',
        filename: 'original.txt',
      }),
    );

    const second = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Copy',
        ownerUserId: userId,
        buffer: Buffer.from('identical duplicate-check content'),
        contentType: 'text/plain',
        filename: 'copy.txt',
      }),
    );

    expect(second.possibleDuplicateOf?.documentId).toBe(first.document.id);
  });

  it('adds a new version and supports restoring an older one without mutating history', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Versioned Doc',
        ownerUserId: userId,
        buffer: Buffer.from('version 1 content'),
        contentType: 'text/plain',
        filename: 'v1.txt',
      }),
    );

    await asCompany(companyId, userId, () =>
      service.addVersion(
        result.document.id,
        Buffer.from('version 2 content'),
        'text/plain',
        'v2.txt',
        userId,
      ),
    );

    const restored = await asCompany(companyId, userId, () =>
      service.restoreVersion(result.document.id, 1, userId),
    );
    expect(restored.version).toBe(3);
    expect(restored.filename).toBe('v1.txt');

    const doc = await asCompany(companyId, userId, () => service.getById(result.document.id));
    expect(doc.versions).toHaveLength(3);
    // History is never mutated — version 1's original row still exists unchanged.
    expect(doc.versions.find((v) => v.version === 1)?.filename).toBe('v1.txt');
  });

  it('returns a working signed download URL for the latest version', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Downloadable',
        ownerUserId: userId,
        buffer: Buffer.from('downloadable content'),
        contentType: 'text/plain',
        filename: 'downloadable.txt',
      }),
    );

    const { url, filename } = await asCompany(companyId, userId, () =>
      service.download(result.document.id, userId),
    );
    expect(url).toMatch(/^https?:\/\//);
    expect(filename).toBe('downloadable.txt');
    expect(auditEntries.some((e) => e.eventType === 'DOCUMENT_DOWNLOADED')).toBe(true);
  });

  it('finds an uploaded document via full-text search on its title/description', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Petrochemical Export Certificate',
        description: 'Certificate of origin for the shipment',
        ownerUserId: userId,
        buffer: Buffer.from('certificate content'),
        contentType: 'text/plain',
        filename: 'certificate.txt',
      }),
    );

    const hits = await asCompany(companyId, userId, () =>
      service.search(companyId, 'certificate origin'),
    );
    expect(hits.some((d) => d.id === result.document.id)).toBe(true);
  });

  it('auto-publishes when no approval rule matches, and archives on request', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Approval Flow Doc',
        ownerUserId: userId,
        buffer: Buffer.from('approval flow content'),
        contentType: 'text/plain',
        filename: 'approval.txt',
      }),
    );

    const approvals = await asCompany(companyId, userId, () =>
      service.requestApproval(result.document.id, userId),
    );
    expect(approvals).toHaveLength(0);

    const afterRequest = await asCompany(companyId, userId, () =>
      service.getById(result.document.id),
    );
    expect(afterRequest.status).toBe('PUBLISHED');

    const archived = await asCompany(companyId, userId, () =>
      service.archive(result.document.id, userId),
    );
    expect(archived.status).toBe('ARCHIVED');
    expect(auditEntries.some((e) => e.eventType === 'DOCUMENT_ARCHIVED')).toBe(true);
  });

  it('resolves an actual approval rule via the Rules Engine and waits for a decision', async () => {
    const ruleManagement = new RuleManagementService(db, new RuleRepository(db));
    const rule = await asCompany(companyId, userId, () =>
      ruleManagement.create({
        companyId,
        name: 'documents-require-approval',
        module: 'documents',
        priority: 10,
        condition: { '==': [{ var: 'module' }, 'finance'] } as never,
        actions: [{ type: 'REQUEST_APPROVAL', params: { approverUserId: userId } }],
      }),
    );
    await asCompany(companyId, userId, () => ruleManagement.publish(rule.id));

    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Needs Real Approval',
        ownerUserId: userId,
        buffer: Buffer.from('needs approval content'),
        contentType: 'text/plain',
        filename: 'needs-approval.txt',
      }),
    );

    const approvals = await asCompany(companyId, userId, () =>
      service.requestApproval(result.document.id, userId),
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);

    const pending = await asCompany(companyId, userId, () => service.getById(result.document.id));
    expect(pending.status).toBe('PENDING_APPROVAL');

    const decided = await asCompany(companyId, userId, () =>
      service.decideApproval(approvals[0].id, 'APPROVED', userId, 'looks good'),
    );
    expect(decided.status).toBe('APPROVED');

    const published = await asCompany(companyId, userId, () => service.getById(result.document.id));
    expect(published.status).toBe('PUBLISHED');
  });

  it('organizes documents via folders, categories, and tags', async () => {
    const folder = await asCompany(companyId, userId, () =>
      service.createFolder(companyId, 'Contracts'),
    );
    const category = await asCompany(companyId, userId, () =>
      service.createCategory(companyId, 'Legal'),
    );
    const tag = await asCompany(companyId, userId, () => service.createTag(companyId, 'urgent'));

    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'contracts',
        entityType: 'contract',
        title: 'Organized Doc',
        folderId: folder.id,
        categoryId: category.id,
        ownerUserId: userId,
        buffer: Buffer.from('organized content'),
        contentType: 'text/plain',
        filename: 'organized.txt',
      }),
    );
    await asCompany(companyId, userId, () => service.assignTag(result.document.id, tag.id));

    const listed = await asCompany(companyId, userId, () =>
      service.list({ companyId, folderId: folder.id }),
    );
    expect(listed.some((d) => d.id === result.document.id)).toBe(true);
  });

  it('flags a document past its retention date as archived via checkRetention', async () => {
    const result = await asCompany(companyId, userId, () =>
      service.upload({
        companyId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Retention Test Doc',
        ownerUserId: userId,
        buffer: Buffer.from('retention content'),
        contentType: 'text/plain',
        filename: 'retention.txt',
        retentionPolicy: { name: 'test-1-day', durationDays: 1 },
      }),
    );

    // Force the retention date into the past directly (bypassing the 1-day policy) so the
    // check has something to find without waiting a real day.
    await withoutTenant(() =>
      rawDb.document.update({
        where: { id: result.document.id },
        data: { retentionExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    );

    const archivedCount = await asCompany(companyId, userId, () =>
      service.checkRetention(companyId),
    );
    expect(archivedCount).toBeGreaterThanOrEqual(1);

    const doc = await asCompany(companyId, userId, () => service.getById(result.document.id));
    expect(doc.status).toBe('ARCHIVED');
  });
}, 30000);

describe('Document Management tenant isolation', () => {
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;
  let service: DocumentService;

  beforeAll(async () => {
    const companyA = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-DOC-A-${Date.now()}`,
          legalName: 'Doc Tenant A',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const companyB = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-DOC-B-${Date.now()}`,
          legalName: 'Doc Tenant B',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyAId = companyA.id;
    companyBId = companyB.id;

    const userA = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyAId,
          firstName: 'A',
          lastName: 'User',
          email: `doc-a-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    const userB = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyBId,
          firstName: 'B',
          lastName: 'User',
          email: `doc-b-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userAId = userA.id;
    userBId = userB.id;

    const storage = getSharedStorage();
    const aiRouter = buildAiRouter(db);
    const prompts = buildPromptTemplateService(db);
    const searchService = new SearchService(
      new DocumentFullTextSearchService(db),
      new PgVectorSearchProvider(db, aiRouter),
    );
    const eventBus = new RedisStreamsEventBus();
    const ruleRepository = new RuleRepository(db);
    const ruleActionExecutor = new RuleActionExecutor({
      eventBus,
      aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
    });
    const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
      new LegacyApprovalRuleSource(db),
      new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
    ]);
    const audit = { record: async () => {} };
    service = new DocumentService(
      db,
      storage,
      searchService,
      approvalEvaluator,
      eventBus,
      audit,
      new RealOcrProvider(aiRouter, prompts),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.documentVersion.deleteMany({
        where: { document: { companyId: { in: [companyAId, companyBId] } } },
      });
      await rawDb.document.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    });
  });

  it("Company B cannot read Company A's document by id", async () => {
    const docA = await asCompany(companyAId, userAId, () =>
      service.upload({
        companyId: companyAId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Company A Secret Doc',
        ownerUserId: userAId,
        buffer: Buffer.from('company a secret content'),
        contentType: 'text/plain',
        filename: 'secret-a.txt',
      }),
    );

    await expect(
      asCompany(companyBId, userBId, () => service.getById(docA.document.id)),
    ).rejects.toThrow();
  });

  it("Company B's document search never surfaces Company A's documents", async () => {
    await asCompany(companyAId, userAId, () =>
      service.upload({
        companyId: companyAId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Unique Searchable Term Alpha',
        ownerUserId: userAId,
        buffer: Buffer.from('alpha content'),
        contentType: 'text/plain',
        filename: 'alpha.txt',
      }),
    );

    const hits = await asCompany(companyBId, userBId, () =>
      service.search(companyBId, 'Unique Searchable Term Alpha'),
    );
    expect(hits).toHaveLength(0);
  });

  it("Company B cannot approve Company A's document", async () => {
    const docA = await asCompany(companyAId, userAId, () =>
      service.upload({
        companyId: companyAId,
        module: 'finance',
        entityType: 'invoice',
        title: 'Company A Approval Doc',
        ownerUserId: userAId,
        buffer: Buffer.from('company a approval content'),
        contentType: 'text/plain',
        filename: 'approval-a.txt',
      }),
    );

    await expect(
      asCompany(companyBId, userBId, () => service.requestApproval(docA.document.id, userBId)),
    ).rejects.toThrow();
  });
}, 30000);
