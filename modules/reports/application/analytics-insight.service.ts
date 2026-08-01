import { Injectable } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { AIInsight } from '@platform/database';
import { AnalyticsHistoryRepository } from '../infrastructure/analytics-history.repository';
import { AnalyticsKpiService } from './analytics-kpi.service';
import { AnalyticsForecastService } from './analytics-forecast.service';
import type { AiNarrativePort, AnalyticsAuditWriter } from './ports';

const SYSTEM_PROMPT =
  'You are a business analyst for a petrochemical trading company. Given a JSON snapshot of ' +
  'real KPI figures, write a short (3-5 sentence) executive briefing in plain prose. Only ' +
  'discuss the numbers given — never invent a figure that is not present in the input.';

/**
 * The real substance behind doc 20's "AI Daily Briefing"/"business summaries" — gathers real
 * KPI numbers first (`AnalyticsKpiService`, `AnalyticsForecastService`), then asks the AI to
 * narrate over them via a single non-tool-calling completion. The AI never computes a number
 * itself, only explains ones already computed for real. See docs/DOMAIN_MODEL_PHASE7.md.
 */
@Injectable()
export class AnalyticsInsightService {
  constructor(
    private readonly kpis: AnalyticsKpiService,
    private readonly forecasts: AnalyticsForecastService,
    private readonly narrative: AiNarrativePort,
    private readonly audit: AnalyticsAuditWriter,
    private readonly history: AnalyticsHistoryRepository,
  ) {}

  async generateBusinessBriefing(
    companyId: string,
    actorUserId: string | undefined,
    ipAddress?: string | null,
  ): Promise<AIInsight> {
    const [executive, sales, ai, latestForecast] = await Promise.all([
      this.kpis.getExecutiveKpis(companyId),
      this.kpis.getSalesKpis(companyId),
      this.kpis.getAiKpis(companyId),
      this.forecasts.getLatestSalesForecast(companyId),
    ]);

    const userPrompt = JSON.stringify({
      revenueMonthToDate: executive.revenueMonthToDate,
      grossProfit: executive.grossProfit,
      outstandingReceivables: executive.outstandingReceivables,
      quoteWinRate: sales.quoteWinRate,
      aiAutomationRate: ai.automationRate,
      projectedNextMonthRevenue: latestForecast?.projectedValue ?? null,
    });

    const body = await this.narrative.generateNarrative(companyId, SYSTEM_PROMPT, userPrompt);

    const insight = await this.history.createInsight({
      companyId,
      type: 'BUSINESS_BRIEFING',
      title: 'Business Briefing',
      body,
    });

    await this.audit.record({
      companyId,
      actorUserId: actorUserId ?? null,
      eventType: AuditEventType.AI_INSIGHT_GENERATED,
      entityType: 'AIInsight',
      entityId: insight.id,
      after: { type: 'BUSINESS_BRIEFING' },
      ipAddress: ipAddress ?? null,
    });

    return insight;
  }

  listInsights(companyId: string, limit = 20): Promise<AIInsight[]> {
    return this.history.listInsights(companyId, limit);
  }
}
