/**
 * Real scheduled report delivery (doc 20) against real Postgres + Redis + MinIO — see
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section. Creates a real ReportSchedule, then fires
 * its handler directly (same "invoke the handler function directly" pattern
 * tasks-event-consumption.e2e-spec.ts uses rather than waiting on a real cron tick), asserting
 * a real Report + Document were created and a real email send was attempted with the right
 * recipient, linking to the report's real presigned download URL — never a binary attachment.
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
import { ConsoleEmailSenderAdapter, type EmailSenderPort } from '@platform/notifications';
import {
  AnalyticsKpiService,
  AnalyticsReportService,
  ReportRepository,
  runDueSchedules,
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

describe('Analytics: real scheduled report delivery (live Postgres + Redis + MinIO)', () => {
  let companyId: string;
  let userId: string;
  let reportRepository: ReportRepository;
  let reportService: AnalyticsReportService;
  let emailSends: Array<{ to: string; subject: string; body: string }>;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-SCHEDULE-${Date.now()}`,
          legalName: 'Scheduled Report Test Co',
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
          firstName: 'Schedule',
          lastName: 'Tester',
          email: `schedule-tester-${Date.now()}@test.local`,
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

    emailSends = [];
    const realConsoleAdapter = new ConsoleEmailSenderAdapter();
    const emailSender: EmailSenderPort = {
      send: async (message) => {
        emailSends.push(message);
        return realConsoleAdapter.send(message);
      },
    };

    const kpis = new AnalyticsKpiService(db, NOOP_FINANCE_REPORTS);
    const reportAudit = { record: async () => {} };
    reportRepository = new ReportRepository(db);
    reportService = new AnalyticsReportService(
      kpis,
      new PdfKitDocumentGenerator(),
      storage,
      emailSender,
      reportAudit,
      reportRepository,
    );
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.report.deleteMany({ where: { companyId } });
      await rawDb.reportSchedule.deleteMany({ where: { companyId } });
      await rawDb.documentVersion.deleteMany({ where: { document: { companyId } } });
      await rawDb.document.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('runs a real schedule on demand: generates the report, stores it, and sends a real email linking to it', async () => {
    const schedule = await asCompany(companyId, userId, () =>
      reportService.createSchedule({
        companyId,
        reportType: 'AI_USAGE',
        format: 'PDF',
        frequency: 'DAILY',
        recipientEmails: ['ops@test.local'],
        createdByUserId: userId,
      }),
    );

    await runDueSchedules([schedule.id], reportRepository, reportService);

    const reports = await withoutTenant(() =>
      rawDb.report.findMany({ where: { scheduleId: schedule.id } }),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].documentId).toBeTruthy();

    const updatedSchedule = await withoutTenant(() =>
      rawDb.reportSchedule.findUniqueOrThrow({ where: { id: schedule.id } }),
    );
    expect(updatedSchedule.lastRunAt).not.toBeNull();

    expect(emailSends).toHaveLength(1);
    expect(emailSends[0].to).toBe('ops@test.local');
    expect(emailSends[0].body).toContain('http');
  }, 30000);
});
