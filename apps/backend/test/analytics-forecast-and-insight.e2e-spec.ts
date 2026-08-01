/**
 * Real Sales Forecast (deterministic linear trend, doc 20) and real AI-generated Business
 * Briefing insight against real Postgres + local Ollama — see docs/DOMAIN_MODEL_PHASE7.md,
 * Analytics section. The forecast never asks the AI to guess a number; the AI only narrates
 * over the real KPI figures already computed.
 *
 * Requires DATABASE_URL and a local Ollama daemon with `qwen2.5:3b` pulled.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import {
  AnalyticsKpiService,
  AnalyticsForecastService,
  AnalyticsInsightService,
  AnalyticsHistoryRepository,
  type FinanceReportsPort,
  type AiNarrativePort,
} from '@modules/reports';
import { buildAiRouter } from '../src/common/ai/ai-factory';

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

describe('Analytics: real Sales Forecast + AI Business Briefing (live Postgres + local Ollama)', () => {
  let companyId: string;
  let userId: string;
  let customerId: string;
  let forecastService: AnalyticsForecastService;
  let insightService: AnalyticsInsightService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-FORECAST-${Date.now()}`,
          legalName: 'Forecast Test Co',
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
          firstName: 'Forecast',
          lastName: 'Tester',
          email: `forecast-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const customer = await withoutTenant(() =>
      rawDb.customer.create({
        data: {
          companyId,
          customerCode: `CUST-${Date.now()}`,
          legalName: 'Forecast Test Customer',
          country: 'US',
          currency: 'USD',
        },
      }),
    );
    customerId = customer.id;

    await withoutTenant(() =>
      rawDb.aiProviderConfig.create({
        data: {
          companyId,
          provider: 'OLLAMA',
          enabled: true,
          isDefault: true,
          priority: 0,
          defaultChatModel: 'qwen2.5:3b',
          defaultEmbedModel: 'nomic-embed-text',
        },
      }),
    );

    // Three trailing months of real Order revenue on a clean upward trend: 1000, 2000, 3000 —
    // a real linear-regression projection over this series should continue to ~4000.
    const now = new Date();
    const months = [-2, -1, 0].map(
      (offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15)),
    );
    const amounts = [1000, 2000, 3000];
    for (let i = 0; i < months.length; i++) {
      await withoutTenant(() =>
        rawDb.order.create({
          data: {
            companyId,
            orderNumber: `ORD-FC-${i}-${Date.now()}`,
            customerId,
            status: 'CONFIRMED',
            currency: 'USD',
            subtotal: amounts[i],
            totalAmount: amounts[i],
            createdByUserId: userId,
            createdAt: months[i],
          },
        }),
      );
    }

    const kpis = new AnalyticsKpiService(db, NOOP_FINANCE_REPORTS);
    const audit = { record: async () => {} };
    const history = new AnalyticsHistoryRepository(db);
    forecastService = new AnalyticsForecastService(kpis, audit, history);

    const aiRouter = buildAiRouter(db);
    const narrative: AiNarrativePort = {
      generateNarrative: async (cid, systemPrompt, userPrompt) => {
        const result = await aiRouter.chatComplete(
          cid,
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
    insightService = new AnalyticsInsightService(kpis, forecastService, narrative, audit, history);
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.aIInsight.deleteMany({ where: { companyId } });
      await rawDb.forecast.deleteMany({ where: { companyId } });
      await rawDb.aiUsageRecord.deleteMany({ where: { companyId } });
      await rawDb.order.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('generates a real Sales Forecast via deterministic linear trend over real order history', async () => {
    const forecast = await asCompany(companyId, userId, () =>
      forecastService.generateSalesForecast(companyId, userId),
    );
    expect(forecast.type).toBe('SALES');
    expect(forecast.basisPeriods).toBe(3);
    expect(Number(forecast.projectedValue)).toBeCloseTo(4000);

    const latest = await asCompany(companyId, userId, () =>
      forecastService.getLatestSalesForecast(companyId),
    );
    expect(latest?.id).toBe(forecast.id);
  }, 20000);

  it('generates a real AI-written Business Briefing narrating over real KPI figures', async () => {
    const before = await withoutTenant(() => rawDb.aiUsageRecord.count({ where: { companyId } }));

    const insight = await asCompany(companyId, userId, () =>
      insightService.generateBusinessBriefing(companyId, userId),
    );

    expect(insight.type).toBe('BUSINESS_BRIEFING');
    expect(insight.body.length).toBeGreaterThan(0);

    const after = await withoutTenant(() => rawDb.aiUsageRecord.count({ where: { companyId } }));
    expect(after).toBeGreaterThan(before);

    const listed = await asCompany(companyId, userId, () => insightService.listInsights(companyId));
    expect(listed.some((i) => i.id === insight.id)).toBe(true);
  }, 30000);
});
