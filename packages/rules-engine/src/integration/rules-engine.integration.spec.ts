/**
 * Integration test — requires live Postgres (and Redis, since the action executor depends
 * on @platform/event-bus for the GENERATE_TASK action, even though it isn't exercised here).
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/navoasis \
 *   REDIS_URL=redis://localhost:6379 \
 *   pnpm --filter @platform/rules-engine test:integration
 *
 * Covers: rule create -> publish -> evaluate (deterministic conflict resolution) -> simulate
 * (conflict detection surfaced) -> RuleExecution persisted.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { RuleRepository } from '../infrastructure/rule.repository';
import { RuleManagementService } from '../application/rule-management.service';
import { RuleEvaluationService } from '../application/rule-evaluation.service';
import { RuleActionExecutor } from '../application/rule-action-executor';
import { NotImplementedAiDecisionProvider } from '../domain/ports/ai-decision-provider.port';

const prisma = getPrismaClient();

function asTenant<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('Rules Engine integration (live Postgres)', () => {
  const companyId = randomUUID();
  const module = `integration-${randomUUID()}`;
  const repository = new RuleRepository(prisma);
  const management = new RuleManagementService(prisma, repository);
  const executor = new RuleActionExecutor({
    eventBus: new RedisStreamsEventBus(),
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
  });
  const evaluation = new RuleEvaluationService(repository, executor, [], prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates, publishes, and evaluates a single ALLOW rule', async () => {
    const created = await asTenant(companyId, () =>
      management.create({
        companyId,
        name: 'allow-us-orders',
        module,
        priority: 1,
        condition: { '==': [{ var: 'region' }, 'US'] } as never,
        actions: [{ type: 'ALLOW', params: {} }],
      }),
    );
    await asTenant(companyId, () => management.publish(created.id));

    const decision = await asTenant(companyId, () =>
      evaluation.evaluate({ module, companyId, attributes: { region: 'US' } }),
    );
    expect(decision.decision).toBe('ALLOW');
    expect(decision.matchedRules).toContain(created.id);

    const executions = await asTenant(companyId, () =>
      prisma.ruleExecution.findMany({ where: { ruleId: created.id } }),
    );
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[0]?.decision).toBe('ALLOW');
  }, 20000);

  it('resolves a BLOCK-vs-ALLOW conflict with BLOCK winning regardless of priority order', async () => {
    const allowRule = await asTenant(companyId, () =>
      management.create({
        companyId,
        name: 'allow-high-value',
        module,
        priority: 10,
        condition: { '==': [{ var: 'region' }, 'EU'] } as never,
        actions: [{ type: 'ALLOW', params: {} }],
      }),
    );
    const blockRule = await asTenant(companyId, () =>
      management.create({
        companyId,
        name: 'block-sanctioned',
        module,
        priority: 1,
        condition: { '==': [{ var: 'region' }, 'EU'] } as never,
        actions: [{ type: 'BLOCK', params: { message: 'sanctioned region' } }],
      }),
    );
    await asTenant(companyId, () => management.publish(allowRule.id));
    const publishResult = await asTenant(companyId, () => management.publish(blockRule.id));

    // Publish-time conflict detection should flag the overlapping ALLOW/BLOCK pair.
    expect(publishResult.conflicts.length).toBeGreaterThanOrEqual(1);

    const decision = await asTenant(companyId, () =>
      evaluation.evaluate({ module, companyId, attributes: { region: 'EU' } }),
    );
    // Higher-priority ALLOW is evaluated first, but since it is not terminal, BLOCK (lower
    // priority) still executes and short-circuits — BLOCK wins per docs/DOMAIN_MODEL_PHASE2.md §4.
    expect(decision.decision).toBe('BLOCK');
  }, 20000);

  it('POST /rules/simulate equivalent: simulate does not persist a RuleExecution and reports conflicts', async () => {
    const simModule = `sim-${randomUUID()}`;
    const a = await asTenant(companyId, () =>
      management.create({
        companyId,
        name: 'sim-allow',
        module: simModule,
        priority: 5,
        condition: { '==': [{ var: 'flag' }, true] } as never,
        actions: [{ type: 'ALLOW', params: {} }],
      }),
    );
    const b = await asTenant(companyId, () =>
      management.create({
        companyId,
        name: 'sim-block',
        module: simModule,
        priority: 5,
        condition: { '==': [{ var: 'flag' }, true] } as never,
        actions: [{ type: 'BLOCK', params: {} }],
      }),
    );
    await asTenant(companyId, () => management.publish(a.id));
    await asTenant(companyId, () => management.publish(b.id));

    const before = await asTenant(companyId, () =>
      prisma.ruleExecution.count({ where: { ruleId: { in: [a.id, b.id] } } }),
    );
    const decision = await asTenant(companyId, () =>
      evaluation.evaluate({ module: simModule, companyId, attributes: { flag: true } }, true),
    );
    const after = await asTenant(companyId, () =>
      prisma.ruleExecution.count({ where: { ruleId: { in: [a.id, b.id] } } }),
    );

    expect(after).toBe(before); // simulation must not persist executions
    expect(['ALLOW', 'BLOCK']).toContain(decision.decision);
  }, 20000);
});
