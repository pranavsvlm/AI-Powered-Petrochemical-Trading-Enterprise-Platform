import type {
  TenantScopedPrismaClient,
  Report,
  ReportType,
  ReportFormat,
  ReportSchedule,
  ReportScheduleFrequency,
} from '@platform/database';

export interface CreateReportInput {
  companyId: string;
  type: ReportType;
  format: ReportFormat;
  documentId?: string;
  scheduleId?: string;
  generatedByUserId?: string;
}

export interface CreateScheduleInput {
  companyId: string;
  reportType: ReportType;
  format: ReportFormat;
  frequency: ReportScheduleFrequency;
  recipientEmails: string[];
  // Required (unlike Report.generatedByUserId) — a schedule's creator becomes the Document
  // owner for every report it generates, and Document.ownerUserId is a real, required FK.
  createdByUserId: string;
}

export class ReportRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  createReport(input: CreateReportInput): Promise<Report> {
    return this.db.report.create({ data: input });
  }

  attachDocument(reportId: string, documentId: string): Promise<Report> {
    return this.db.report.update({ where: { id: reportId }, data: { documentId } });
  }

  listReports(companyId: string, type?: ReportType): Promise<Report[]> {
    return this.db.report.findMany({
      where: { companyId, type },
      orderBy: { generatedAt: 'desc' },
    });
  }

  createSchedule(input: CreateScheduleInput): Promise<ReportSchedule> {
    return this.db.reportSchedule.create({ data: input });
  }

  listSchedules(companyId: string): Promise<ReportSchedule[]> {
    return this.db.reportSchedule.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findSchedule(id: string): Promise<ReportSchedule | null> {
    return this.db.reportSchedule.findUnique({ where: { id } });
  }

  setScheduleActive(id: string, isActive: boolean): Promise<ReportSchedule> {
    return this.db.reportSchedule.update({ where: { id }, data: { isActive } });
  }

  markScheduleRun(id: string, lastRunAt: Date): Promise<ReportSchedule> {
    return this.db.reportSchedule.update({ where: { id }, data: { lastRunAt } });
  }

  /**
   * Cross-tenant by design — the scheduler process serves every company, same reasoning
   * `apps/backend/src/scheduler/scheduler.ts`'s own workflow polling already established.
   * Caller must invoke this inside `withoutTenantScope()` (`@platform/database`) or the
   * tenant extension's fail-closed check throws.
   */
  listActiveSchedules(): Promise<ReportSchedule[]> {
    return this.db.reportSchedule.findMany({ where: { isActive: true } });
  }
}
