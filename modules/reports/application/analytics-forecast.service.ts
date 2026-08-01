import { Injectable } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { Forecast } from '@platform/database';
import { projectNextPeriod } from '../domain/sales-forecast';
import { AnalyticsHistoryRepository } from '../infrastructure/analytics-history.repository';
import { AnalyticsKpiService } from './analytics-kpi.service';
import type { AnalyticsAuditWriter } from './ports';

const DEFAULT_BASIS_MONTHS = 6;
const FORECAST_HORIZON_MONTHS = 1;

/**
 * Sales revenue forecasting — a real deterministic linear-trend projection
 * (`domain/sales-forecast.ts`), never an AI guess. See docs/DOMAIN_MODEL_PHASE7.md, Analytics
 * section: this platform's AI narrates over real numbers, it never invents them.
 */
@Injectable()
export class AnalyticsForecastService {
  constructor(
    private readonly kpis: AnalyticsKpiService,
    private readonly audit: AnalyticsAuditWriter,
    private readonly history: AnalyticsHistoryRepository,
  ) {}

  async generateSalesForecast(
    companyId: string,
    actorUserId: string | undefined,
    ipAddress?: string | null,
  ): Promise<Forecast> {
    const monthlyRevenue = await this.kpis.getMonthlyRevenueHistory(
      companyId,
      DEFAULT_BASIS_MONTHS,
    );
    const { projectedValue, basisPeriods } = projectNextPeriod(monthlyRevenue);

    const forecast = await this.history.createForecast({
      companyId,
      type: 'SALES',
      horizonMonths: FORECAST_HORIZON_MONTHS,
      basisPeriods,
      projectedValue,
      generatedByUserId: actorUserId,
    });

    await this.audit.record({
      companyId,
      actorUserId: actorUserId ?? null,
      eventType: AuditEventType.FORECAST_GENERATED,
      entityType: 'Forecast',
      entityId: forecast.id,
      after: { type: 'SALES', projectedValue, basisPeriods },
      ipAddress: ipAddress ?? null,
    });

    return forecast;
  }

  getLatestSalesForecast(companyId: string): Promise<Forecast | null> {
    return this.history.latestForecast(companyId, 'SALES');
  }
}
