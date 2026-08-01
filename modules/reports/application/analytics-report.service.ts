import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { Report, ReportFormat, ReportSchedule, ReportType } from '@platform/database';
import type { DocumentGeneratorPort, DocumentTemplate } from '@platform/workflow';
import type { EmailSenderPort } from '@platform/notifications';
import { toCsv } from '../domain/csv-serializer';
import { ReportRepository, type CreateScheduleInput } from '../infrastructure/report.repository';
import { AnalyticsKpiService } from './analytics-kpi.service';
import type { AnalyticsAuditWriter, ReportStoragePort } from './ports';

interface ReportContent {
  title: string;
  textBlocks: string[];
  headers: string[];
  rows: Array<Array<string | number>>;
}

/**
 * Real Report generation (PDF via the reused `PdfKitDocumentGenerator` from `@platform/workflow`,
 * CSV via a small hand-rolled serializer), stored through Document Management's real
 * `DocumentService.upload()` — the same generic-attachment pattern used elsewhere. See
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section.
 */
@Injectable()
export class AnalyticsReportService {
  private readonly repo: ReportRepository;

  constructor(
    private readonly kpis: AnalyticsKpiService,
    private readonly pdfGenerator: DocumentGeneratorPort,
    private readonly storage: ReportStoragePort,
    private readonly emailSender: EmailSenderPort,
    private readonly audit: AnalyticsAuditWriter,
    repository: ReportRepository,
  ) {
    this.repo = repository;
  }

  private async buildContent(companyId: string, type: ReportType): Promise<ReportContent> {
    switch (type) {
      case 'EXECUTIVE': {
        const kpi = await this.kpis.getExecutiveKpis(companyId);
        return {
          title: 'Executive Dashboard Report',
          textBlocks: [
            `Revenue (month to date): ${kpi.revenueMonthToDate.toFixed(2)}`,
            `Gross profit: ${kpi.grossProfit.toFixed(2)}`,
            `Outstanding receivables: ${kpi.outstandingReceivables.toFixed(2)}`,
          ],
          headers: ['Metric', 'Value'],
          rows: [
            ['Revenue (MTD)', kpi.revenueMonthToDate],
            ['Gross profit', kpi.grossProfit],
            ['Outstanding receivables', kpi.outstandingReceivables],
          ],
        };
      }
      case 'SALES': {
        const kpi = await this.kpis.getSalesKpis(companyId);
        return {
          title: 'Sales Analytics Report',
          textBlocks: [`Quote win rate: ${(kpi.quoteWinRate * 100).toFixed(1)}%`],
          headers: ['Customer', 'Revenue'],
          rows: kpi.revenueByCustomer.map((r) => [r.customerId, r.revenue]),
        };
      }
      case 'TRADING': {
        const kpi = await this.kpis.getTradingKpis(companyId);
        return {
          title: 'Trading Analytics Report',
          textBlocks: ['Order counts by status included below.'],
          headers: ['Status', 'Count'],
          rows: Object.entries(kpi.orderCountsByStatus),
        };
      }
      case 'FINANCE': {
        const { trialBalance } = await this.kpis.getFinanceKpis(companyId);
        return {
          title: 'Finance Report — Trial Balance',
          textBlocks: [
            `Total debits: ${trialBalance.totalDebits.toFixed(2)}`,
            `Total credits: ${trialBalance.totalCredits.toFixed(2)}`,
            `Balanced: ${trialBalance.isBalanced ? 'Yes' : 'No'}`,
          ],
          headers: ['Account', 'Debit', 'Credit', 'Balance'],
          rows: trialBalance.rows.map((r) => [r.name, r.debitTotal, r.creditTotal, r.balance]),
        };
      }
      case 'INVENTORY': {
        const kpi = await this.kpis.getInventoryKpis(companyId);
        return {
          title: 'Inventory Analytics Report',
          textBlocks: [`Total inventory value: ${kpi.inventoryValue.toFixed(2)}`],
          headers: ['Product', 'Quantity on hand'],
          rows: kpi.stockByProduct.map((r) => [r.productId, r.quantityOnHand]),
        };
      }
      case 'PROCUREMENT': {
        const kpi = await this.kpis.getProcurementKpis(companyId);
        return {
          title: 'Procurement Analytics Report',
          textBlocks: [`Spend this month: ${kpi.spendMonthToDate.toFixed(2)}`],
          headers: ['Supplier', 'Spend'],
          rows: kpi.spendBySupplier.map((r) => [r.supplierId, r.spend]),
        };
      }
      case 'AI_USAGE': {
        const kpi = await this.kpis.getAiKpis(companyId);
        return {
          title: 'AI Usage Report',
          textBlocks: [
            `Requests: ${kpi.requestCount}`,
            `Cost (month to date): ${kpi.totalCostUsd.toFixed(4)}`,
            `Automation rate: ${(kpi.automationRate * 100).toFixed(1)}%`,
            `Human override rate: ${(kpi.humanOverrideRate * 100).toFixed(1)}%`,
            `Prompt success rate: ${(kpi.promptSuccessRate * 100).toFixed(1)}%`,
          ],
          headers: ['Metric', 'Value'],
          rows: [
            ['Requests', kpi.requestCount],
            ['Cost (USD)', kpi.totalCostUsd],
            ['Automation rate', kpi.automationRate],
            ['Human override rate', kpi.humanOverrideRate],
            ['Prompt success rate', kpi.promptSuccessRate],
          ],
        };
      }
    }
  }

  async generateReport(
    companyId: string,
    type: ReportType,
    format: ReportFormat,
    userId: string,
    scheduleId?: string,
  ): Promise<Report> {
    const content = await this.buildContent(companyId, type);

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'PDF') {
      const template: DocumentTemplate = {
        title: content.title,
        textBlocks: content.textBlocks,
        table: { headers: content.headers, rows: content.rows.map((row) => row.map(String)) },
      };
      const generated = await this.pdfGenerator.generate(template, {});
      buffer = generated.buffer;
      contentType = generated.mimeType;
      filename = generated.filename;
    } else {
      const csv = toCsv(content.headers, content.rows);
      buffer = Buffer.from(csv, 'utf-8');
      contentType = 'text/csv';
      filename = `${content.title.replace(/[^a-z0-9-_]+/gi, '_')}.csv`;
    }

    const report = await this.repo.createReport({
      companyId,
      type,
      format,
      generatedByUserId: userId,
      scheduleId,
    });

    const { documentId } = await this.storage.store({
      companyId,
      entityId: report.id,
      title: content.title,
      buffer,
      contentType,
      filename,
      ownerUserId: userId,
    });

    // The Document upload needs the Report's id as its entityId, so the Report row is created
    // first and the document linkage patched in afterward, rather than a second createReport call.
    const linked = await this.repo.attachDocument(report.id, documentId);

    await this.audit.record({
      companyId,
      actorUserId: userId,
      eventType: AuditEventType.REPORT_GENERATED,
      entityType: 'Report',
      entityId: report.id,
      after: { type, format, documentId },
      ipAddress: null,
    });

    return linked;
  }

  listReports(companyId: string, type?: ReportType): Promise<Report[]> {
    return this.repo.listReports(companyId, type);
  }

  createSchedule(input: CreateScheduleInput): Promise<ReportSchedule> {
    return this.repo.createSchedule(input);
  }

  listSchedules(companyId: string): Promise<ReportSchedule[]> {
    return this.repo.listSchedules(companyId);
  }

  async setScheduleActive(id: string, isActive: boolean): Promise<ReportSchedule> {
    const schedule = await this.repo.findSchedule(id);
    if (!schedule) throw new NotFoundException('Schedule not found.');
    return this.repo.setScheduleActive(id, isActive);
  }

  /**
   * Called by the scheduler on each cron fire (and reusable directly by an e2e test the same
   * way `tasks-event-consumption.e2e-spec.ts` invokes its subscriber's handler directly rather
   * than waiting on a real cron tick). Generates the report, then sends a real email linking to
   * the stored file's real presigned download URL — never a binary attachment (see
   * docs/DOMAIN_MODEL_PHASE7.md, Analytics section).
   */
  async runSchedule(schedule: ReportSchedule, actorUserId: string): Promise<Report> {
    const report = await this.generateReport(
      schedule.companyId,
      schedule.reportType,
      schedule.format,
      actorUserId,
      schedule.id,
    );
    await this.repo.markScheduleRun(schedule.id, new Date());

    if (report.documentId && schedule.recipientEmails.length > 0) {
      const downloadUrl = await this.storage.getDownloadUrl(report.documentId, actorUserId);
      const reportTitle = `${schedule.reportType} report`;
      for (const to of schedule.recipientEmails) {
        await this.emailSender.send({
          to,
          subject: `${reportTitle} is ready`,
          body: `Your scheduled report "${reportTitle}" is ready: ${downloadUrl}`,
        });
      }
      await this.audit.record({
        companyId: schedule.companyId,
        actorUserId: null,
        eventType: AuditEventType.SCHEDULED_REPORT_SENT,
        entityType: 'ReportSchedule',
        entityId: schedule.id,
        after: { reportId: report.id, recipients: schedule.recipientEmails.length },
        ipAddress: null,
      });
    }

    return report;
  }
}
