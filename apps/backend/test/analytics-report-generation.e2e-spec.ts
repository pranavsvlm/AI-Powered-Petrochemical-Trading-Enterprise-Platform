/**
 * Real Report generation (doc 20) against real Postgres + Redis + MinIO — see
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section. Exercises the actual composed
 * `AnalyticsReportService` (same wiring as apps/backend/src/modules/analytics/analytics.module
 * .ts), generating a real PDF (via the reused PdfKitDocumentGenerator) and a real CSV, both
 * stored through the real Document Management upload path — not mocks.
 *
 * Requires DATABASE_URL, REDIS_URL, and MinIO env vars (STORAGE_PROVIDER=minio plus
 * MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET).
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
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider, RealOcrProvider } from '@platform/ai';
import { DocumentService } from '@modules/document-management';
import { PdfKitDocumentGenerator } from '@platform/workflow';
import { ConsoleEmailSenderAdapter } from '@platform/notifications';
import {
  AnalyticsKpiService,
  AnalyticsReportService,
  ReportRepository,
  type FinanceReportsPort,
  type ReportStoragePort,
} from '@modules/reports';
import { buildAiRouter, buildPromptTemplateService } from '../src/common/ai/ai-factory';

const db = getPrismaClient();
const rawDb = new PrismaClient();

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

const NOOP_FINANCE_REPORTS: FinanceReportsPort = {
  trialBalance: async () => ({ rows: [], totalDebits: 0, totalCredits: 0, isBalanced: true }),
  profitAndLoss: async () => ({
    revenue: 0,
    expenses: 0,
    netIncome: 0,
    revenueLines: [],
    expenseLines: [],
  }),
};

describe('Analytics: real Report generation (live Postgres + Redis + MinIO)', () => {
  let companyId: string;
  let userId: string;
  let reportService: AnalyticsReportService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-REPORT-${Date.now()}`,
          legalName: 'Report Generation Test Co',
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
          firstName: 'Report',
          lastName: 'Tester',
          email: `report-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const eventBus = new RedisStreamsEventBus();
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
      new NativeRuleSource((cid, module) => ruleRepository.loadApplicable(cid, module)),
    ]);
    const documentAudit = { record: async () => {} };
    const documentService = new DocumentService(
      db,
      getSharedStorage(),
      searchService,
      approvalEvaluator,
      eventBus,
      documentAudit,
      new RealOcrProvider(aiRouter, prompts),
    );

    const storage: ReportStoragePort = {
      store: async (input) => {
        const { document } = await documentService.upload({
          companyId: input.companyId,
          module: 'analytics',
          entityType: 'Report',
          entityId: input.entityId,
          title: input.title,
          ownerUserId: input.ownerUserId,
          buffer: input.buffer,
          contentType: input.contentType,
          filename: input.filename,
        });
        return { documentId: document.id };
      },
      getDownloadUrl: async (documentId, actorUserId) => {
        const { url } = await documentService.download(documentId, actorUserId);
        return url;
      },
    };

    const kpis = new AnalyticsKpiService(db, NOOP_FINANCE_REPORTS);
    const reportAudit = { record: async () => {} };
    const reportRepository = new ReportRepository(db);
    reportService = new AnalyticsReportService(
      kpis,
      new PdfKitDocumentGenerator(),
      storage,
      new ConsoleEmailSenderAdapter(),
      reportAudit,
      reportRepository,
    );
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.report.deleteMany({ where: { companyId } });
      await rawDb.documentVersion.deleteMany({ where: { document: { companyId } } });
      await rawDb.document.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('generates a real PDF report stored as a real Document', async () => {
    const report = await asCompany(companyId, userId, () =>
      reportService.generateReport(companyId, 'AI_USAGE', 'PDF', userId),
    );
    expect(report.format).toBe('PDF');
    expect(report.documentId).toBeTruthy();

    const document = await withoutTenant(() =>
      rawDb.document.findUnique({
        where: { id: report.documentId! },
        include: { versions: true },
      }),
    );
    expect(document).not.toBeNull();
    expect(document!.entityType).toBe('Report');
    expect(document!.entityId).toBe(report.id);
    expect(document!.versions[0]?.sizeBytes).toBeGreaterThan(0);
  }, 20000);

  it('generates a real CSV report stored as a real Document', async () => {
    const report = await asCompany(companyId, userId, () =>
      reportService.generateReport(companyId, 'AI_USAGE', 'CSV', userId),
    );
    expect(report.format).toBe('CSV');
    expect(report.documentId).toBeTruthy();

    const document = await withoutTenant(() =>
      rawDb.document.findUnique({
        where: { id: report.documentId! },
        include: { versions: true },
      }),
    );
    expect(document!.versions[0]?.contentType).toBe('text/csv');
  }, 20000);

  it('lists generated reports for the company', async () => {
    const reports = await asCompany(companyId, userId, () => reportService.listReports(companyId));
    expect(reports.length).toBeGreaterThanOrEqual(2);
  });
});
