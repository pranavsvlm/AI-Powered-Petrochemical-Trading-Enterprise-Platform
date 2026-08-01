import type {
  TenantScopedPrismaClient,
  AnalyticsSnapshot,
  Forecast,
  ForecastType,
  AIInsight,
  AIInsightType,
} from '@platform/database';

export interface CreateForecastInput {
  companyId: string;
  type: ForecastType;
  horizonMonths: number;
  basisPeriods: number;
  projectedValue: number;
  generatedByUserId?: string;
}

export interface CreateInsightInput {
  companyId: string;
  type: AIInsightType;
  title: string;
  body: string;
}

/** Simple create+list persistence for the three "generated artifact" history tables. */
export class AnalyticsHistoryRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  captureSnapshot(companyId: string, metrics: Record<string, unknown>): Promise<AnalyticsSnapshot> {
    return this.db.analyticsSnapshot.create({ data: { companyId, metrics: metrics as never } });
  }

  listSnapshots(companyId: string, limit: number): Promise<AnalyticsSnapshot[]> {
    return this.db.analyticsSnapshot.findMany({
      where: { companyId },
      orderBy: { capturedAt: 'desc' },
      take: limit,
    });
  }

  createForecast(input: CreateForecastInput): Promise<Forecast> {
    return this.db.forecast.create({ data: input });
  }

  latestForecast(companyId: string, type: ForecastType): Promise<Forecast | null> {
    return this.db.forecast.findFirst({
      where: { companyId, type },
      orderBy: { generatedAt: 'desc' },
    });
  }

  createInsight(input: CreateInsightInput): Promise<AIInsight> {
    return this.db.aIInsight.create({ data: input });
  }

  listInsights(companyId: string, limit: number): Promise<AIInsight[]> {
    return this.db.aIInsight.findMany({
      where: { companyId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }
}
