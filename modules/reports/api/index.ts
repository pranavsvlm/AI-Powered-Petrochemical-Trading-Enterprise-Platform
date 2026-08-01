export { AnalyticsKpiService } from '../application/analytics-kpi.service';
export type {
  FinanceReportsPort,
  TrialBalanceSummary,
  TrialBalanceRow,
  ProfitAndLossSummary,
  ProfitAndLossLine,
  ExecutiveKpis,
  SalesKpis,
  TradingKpis,
  InventoryKpis,
  ProcurementKpis,
  AiKpis,
} from '../application/analytics-kpi.service';

export { AnalyticsForecastService } from '../application/analytics-forecast.service';
export { AnalyticsInsightService } from '../application/analytics-insight.service';
export { AnalyticsReportService } from '../application/analytics-report.service';

export type {
  AnalyticsAuditWriter,
  AiNarrativePort,
  ReportStoragePort,
} from '../application/ports';

export { AnalyticsHistoryRepository } from '../infrastructure/analytics-history.repository';
export { ReportRepository } from '../infrastructure/report.repository';
export type { CreateScheduleInput } from '../infrastructure/report.repository';
export {
  registerReportScheduleRunner,
  runDueSchedules,
} from '../infrastructure/report-schedule.scheduler';

export { projectNextPeriod, InsufficientForecastDataError } from '../domain/sales-forecast';
export type { TrendPoint, SalesForecastResult } from '../domain/sales-forecast';
export { toCsv } from '../domain/csv-serializer';
