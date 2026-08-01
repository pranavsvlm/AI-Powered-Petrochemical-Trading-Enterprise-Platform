import { Module } from '@nestjs/common';
import {
  AnalyticsKpiService,
  AnalyticsForecastService,
  AnalyticsInsightService,
  AnalyticsReportService,
  AnalyticsHistoryRepository,
  ReportRepository,
  type FinanceReportsPort,
  type AnalyticsAuditWriter,
  type AiNarrativePort,
  type ReportStoragePort,
} from '@modules/reports';
import { ReportsService } from '@modules/accounting';
import { DocumentService } from '@modules/document-management';
import { PdfKitDocumentGenerator } from '@platform/workflow';
import {
  ConsoleEmailSenderAdapter,
  SmtpEmailSenderAdapter,
  type EmailSenderPort,
} from '@platform/notifications';
import { AnalyticsController } from './analytics.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { DocumentsModule } from '../documents/documents.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildAiRouter } from '../../common/ai/ai-factory';

@Module({
  imports: [AccountingModule, DocumentsModule],
  controllers: [AnalyticsController],
  providers: [
    AuditService,
    {
      provide: AnalyticsKpiService,
      useFactory: (prisma: PrismaService, accountingReports: ReportsService) => {
        const financeReports: FinanceReportsPort = {
          trialBalance: (companyId) => accountingReports.trialBalance(companyId),
          profitAndLoss: (companyId) => accountingReports.profitAndLoss(companyId),
        };
        return new AnalyticsKpiService(prisma.client, financeReports);
      },
      inject: [PrismaService, ReportsService],
    },
    {
      provide: AnalyticsForecastService,
      useFactory: (prisma: PrismaService, audit: AuditService, kpis: AnalyticsKpiService) => {
        const auditWriter: AnalyticsAuditWriter = audit;
        const history = new AnalyticsHistoryRepository(prisma.client);
        return new AnalyticsForecastService(kpis, auditWriter, history);
      },
      inject: [PrismaService, AuditService, AnalyticsKpiService],
    },
    {
      provide: AnalyticsInsightService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        kpis: AnalyticsKpiService,
        forecasts: AnalyticsForecastService,
      ) => {
        const db = prisma.client;
        const aiRouter = buildAiRouter(db);
        const narrative: AiNarrativePort = {
          generateNarrative: async (companyId, systemPrompt, userPrompt) => {
            const result = await aiRouter.chatComplete(
              companyId,
              {
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
              },
              { purpose: 'analytics_business_briefing' },
            );
            return result.content ?? '';
          },
        };
        const auditWriter: AnalyticsAuditWriter = audit;
        const history = new AnalyticsHistoryRepository(db);
        return new AnalyticsInsightService(kpis, forecasts, narrative, auditWriter, history);
      },
      inject: [PrismaService, AuditService, AnalyticsKpiService, AnalyticsForecastService],
    },
    {
      provide: AnalyticsReportService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        kpis: AnalyticsKpiService,
        documents: DocumentService,
      ) => {
        const db = prisma.client;
        const pdfGenerator = new PdfKitDocumentGenerator();

        const storage: ReportStoragePort = {
          store: async (input) => {
            const { document } = await documents.upload({
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
            const { url } = await documents.download(documentId, actorUserId);
            return url;
          },
        };

        // Real EmailSenderPort directly — not NotificationService, which requires a real
        // recipientUserId and is meant for in-app-notified users, not arbitrary schedule
        // recipient addresses. Same lesson Phase 7b's Communication module already learned.
        const emailSender: EmailSenderPort =
          process.env.NOTIFICATIONS_EMAIL_ADAPTER === 'smtp'
            ? new SmtpEmailSenderAdapter()
            : new ConsoleEmailSenderAdapter();

        const auditWriter: AnalyticsAuditWriter = audit;
        const reportRepository = new ReportRepository(db);
        return new AnalyticsReportService(
          kpis,
          pdfGenerator,
          storage,
          emailSender,
          auditWriter,
          reportRepository,
        );
      },
      inject: [PrismaService, AuditService, AnalyticsKpiService, DocumentService],
    },
  ],
  exports: [
    AnalyticsKpiService,
    AnalyticsForecastService,
    AnalyticsInsightService,
    AnalyticsReportService,
  ],
})
export class AnalyticsModule {}
