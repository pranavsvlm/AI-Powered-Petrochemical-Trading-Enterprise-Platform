/**
 * Real cost-ceiling enforcement against local Ollama (docs/DOMAIN_MODEL_PHASE6.md §3) — no
 * mocks for the ceiling check itself. Ollama is free (zero-priced) in the real pricing table,
 * so this test injects a synthetic non-zero price for `OLLAMA:qwen2.5:3b` via AiRouter's
 * constructor-overridable pricing table, specifically to exercise real throttling against real
 * Ollama traffic without needing a paid provider. Proves a call beyond the ceiling is blocked
 * BEFORE dispatch — no further Ollama HTTP call, no further AiUsageRecord row.
 *
 * Requires DATABASE_URL and a local Ollama daemon with `qwen2.5:3b` pulled.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import {
  AiRouter,
  AiProviderConfigRepository,
  AiUsageRepository,
  AiCostCeilingExceededError,
  estimateCostUsd,
  type PricingTable,
  type RouterChatRequest,
} from '@platform/ai';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('AI cost-ceiling throttling (live Postgres + local Ollama, synthetic pricing)', () => {
  let companyId: string;
  const PRICING_TABLE: PricingTable = {
    'OLLAMA:qwen2.5:3b': { promptPricePer1kTokens: 0.01, completionPricePer1kTokens: 0.01 },
  };
  const request: RouterChatRequest = {
    messages: [{ role: 'user', content: 'Say hi.' }],
    maxTokens: 50,
  };
  const estimatedPromptTokens = Math.ceil('Say hi.'.length / 4);
  const estimatedCostPerCall = estimateCostUsd(
    PRICING_TABLE,
    'OLLAMA',
    'qwen2.5:3b',
    estimatedPromptTokens,
    50,
  );

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-AI-CEILING-${Date.now()}`,
          legalName: 'AI Cost Ceiling Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    await withoutTenant(() =>
      rawDb.aiProviderConfig.create({
        data: {
          companyId,
          provider: 'OLLAMA',
          enabled: true,
          isDefault: true,
          priority: 0,
          defaultChatModel: 'qwen2.5:3b',
          monthlyCostCeilingUsd: estimatedCostPerCall * 2.5,
        },
      }),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.aiUsageRecord.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('allows calls under the ceiling, then blocks the call that would exceed it before dispatching to Ollama', async () => {
    const router = new AiRouter({
      providerConfigRepo: new AiProviderConfigRepository(db),
      usageRepo: new AiUsageRepository(db),
      pricingTable: PRICING_TABLE,
    });

    const first = await asCompany(companyId, () =>
      router.chatComplete(companyId, request, { purpose: 'cost_ceiling_test' }),
    );
    expect(first.content).toBeTruthy();
    const second = await asCompany(companyId, () =>
      router.chatComplete(companyId, request, { purpose: 'cost_ceiling_test' }),
    );
    expect(second.content).toBeTruthy();

    const recordsAfterTwo = await withoutTenant(() =>
      rawDb.aiUsageRecord.findMany({ where: { companyId, purpose: 'cost_ceiling_test' } }),
    );
    expect(recordsAfterTwo).toHaveLength(2);

    await expect(
      asCompany(companyId, () =>
        router.chatComplete(companyId, request, { purpose: 'cost_ceiling_test' }),
      ),
    ).rejects.toThrow(AiCostCeilingExceededError);

    const recordsAfterThird = await withoutTenant(() =>
      rawDb.aiUsageRecord.findMany({ where: { companyId, purpose: 'cost_ceiling_test' } }),
    );
    expect(recordsAfterThird).toHaveLength(2);
  }, 60000);
});
