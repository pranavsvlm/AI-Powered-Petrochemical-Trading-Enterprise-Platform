/**
 * Real AiRouter.chatComplete() against local Ollama (docs/DOMAIN_MODEL_PHASE6.md §1-3) — no
 * mocks. Asserts a real non-empty completion and a real AiUsageRecord ledger row.
 *
 * Requires DATABASE_URL and a local Ollama daemon (http://localhost:11434) with `qwen2.5:3b`
 * pulled — see docs/DOMAIN_MODEL_PHASE6.md §2 for why qwen2.5:3b rather than the originally
 * proposed llama3.2:1b: empirical testing against the real Ollama API showed llama3.2:1b
 * reliably mangles tool-call arguments for anything beyond a single flat string field (see the
 * "Model choice" note in that doc section) — a real, verified finding, not a guess.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { buildAiRouter } from '../src/common/ai/ai-factory';

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

describe('AI chat completion (live Postgres + local Ollama)', () => {
  let companyId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-AI-CHAT-${Date.now()}`,
          legalName: 'AI Chat Test Co',
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

  it('returns a real non-empty completion from Ollama and records a real AiUsageRecord', async () => {
    const router = buildAiRouter(db);

    const result = await asCompany(companyId, () =>
      router.chatComplete(
        companyId,
        {
          messages: [
            { role: 'system', content: 'You are a terse assistant. Answer in one short sentence.' },
            { role: 'user', content: 'What is the capital of France? Answer in one sentence.' },
          ],
        },
        { purpose: 'chat' },
      ),
    );

    expect(result.provider).toBe('OLLAMA');
    expect(result.model).toBe('qwen2.5:3b');
    expect(result.content).toBeTruthy();
    expect(result.content?.toLowerCase()).toContain('paris');
    expect(result.promptTokens).toBeGreaterThan(0);
    expect(result.completionTokens).toBeGreaterThan(0);

    const usageRecords = await withoutTenant(() =>
      rawDb.aiUsageRecord.findMany({ where: { companyId, purpose: 'chat' } }),
    );
    expect(usageRecords).toHaveLength(1);
    expect(usageRecords[0]).toMatchObject({
      provider: 'OLLAMA',
      model: 'qwen2.5:3b',
      success: true,
      purpose: 'chat',
    });
    expect(usageRecords[0]!.latencyMs).toBeGreaterThan(0);
  }, 60000);
});
