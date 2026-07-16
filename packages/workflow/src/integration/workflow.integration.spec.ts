/**
 * Integration test — requires live Postgres + Redis:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/navoasis \
 *   REDIS_URL=redis://localhost:6379 \
 *   pnpm --filter @platform/workflow test:integration
 *
 * Covers: a full workflow execution Start -> Approval -> End, where the Approval node
 * delegates resolution to the Rules Engine's public API (RuleEvaluationService.evaluateApproval)
 * rather than reimplementing approval logic, backed by a natively-authored
 * REQUEST_APPROVAL rule.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import {
  RuleRepository,
  RuleManagementService,
  RuleEvaluationService,
  RuleActionExecutor,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
} from '@platform/rules-engine';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { NodeExecutor } from '../application/node-executor';
import { WorkflowExecutionEngine } from '../application/workflow-execution.engine';
import { WorkflowManagementService } from '../application/workflow-management.service';
import { PdfKitDocumentGenerator } from '../infrastructure/pdfkit-document-generator';
import type { WorkflowGraph } from '../domain/workflow-graph';

const prisma = getPrismaClient();

function asTenant<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('Workflow engine integration (live Postgres + Redis)', () => {
  const companyId = randomUUID();
  const approverRoleId = randomUUID();
  const ruleModule = `workflow-approval-${randomUUID()}`;

  const ruleRepository = new RuleRepository(prisma);
  const ruleManagement = new RuleManagementService(prisma, ruleRepository);
  const ruleActionExecutor = new RuleActionExecutor({
    eventBus: new RedisStreamsEventBus(),
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
  });
  const nativeRuleSource = new NativeRuleSource((cid, mod) =>
    ruleRepository.loadApplicable(cid, mod),
  );
  const rulesEvaluation = new RuleEvaluationService(
    ruleRepository,
    ruleActionExecutor,
    [nativeRuleSource],
    prisma,
  );

  const nodeExecutor = new NodeExecutor({
    prisma,
    rulesEngine: rulesEvaluation,
    documentGenerator: new PdfKitDocumentGenerator(),
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
    enqueueDelay: async () => {
      throw new Error('DELAY not exercised in this test');
    },
  });
  const engine = new WorkflowExecutionEngine(nodeExecutor, prisma);
  const workflowManagement = new WorkflowManagementService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('publishes a native REQUEST_APPROVAL rule for the approval module', async () => {
    const rule = await asTenant(companyId, () =>
      ruleManagement.create({
        companyId,
        name: 'require-manager-approval',
        module: ruleModule,
        priority: 1,
        condition: { '==': [{ var: 'requiresApproval' }, true] } as never,
        actions: [{ type: 'REQUEST_APPROVAL', params: { approverRoleId } }],
      }),
    );
    const result = await asTenant(companyId, () => ruleManagement.publish(rule.id));
    expect(result.rule.status).toBe('PUBLISHED');
  }, 20000);

  it('runs Start -> Approval -> End, landing in WAITING with a WorkflowApproval row created via the rules engine', async () => {
    const startId = randomUUID();
    const approvalId = randomUUID();
    const endId = randomUUID();

    const graph: WorkflowGraph = {
      nodes: [
        { id: startId, key: 'start', type: 'START', config: {} },
        {
          id: approvalId,
          key: 'approval',
          type: 'APPROVAL',
          config: { module: ruleModule, level: 1 },
        },
        { id: endId, key: 'end', type: 'END', config: {} },
      ],
      edges: [
        { id: randomUUID(), fromNodeId: startId, toNodeId: approvalId },
        { id: randomUUID(), fromNodeId: approvalId, toNodeId: endId },
      ],
    };

    const workflow = await asTenant(companyId, () =>
      workflowManagement.create({
        companyId,
        name: 'approval-e2e',
        triggerType: 'MANUAL',
        graph,
      }),
    );
    await asTenant(companyId, () => workflowManagement.publish(workflow.id));

    const result = await asTenant(companyId, () =>
      engine.start(graph, workflow.id, companyId, { requiresApproval: true }),
    );

    expect(result.status).toBe('WAITING');

    const execution = await asTenant(companyId, () =>
      prisma.workflowExecution.findUniqueOrThrow({ where: { id: result.executionId } }),
    );
    expect(execution.status).toBe('WAITING');
    expect(execution.currentNodeId).toBe(approvalId);

    const approvals = await asTenant(companyId, () =>
      prisma.workflowApproval.findMany({ where: { executionId: result.executionId } }),
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);
    expect(approvals[0]?.approverRoleId).toBe(approverRoleId);
    expect(approvals[0]?.status).toBe('PENDING');
  }, 20000);

  it('does NOT wait (proceeds straight to End) when the rule condition does not match', async () => {
    const startId = randomUUID();
    const approvalId = randomUUID();
    const endId = randomUUID();

    const graph: WorkflowGraph = {
      nodes: [
        { id: startId, key: 'start', type: 'START', config: {} },
        {
          id: approvalId,
          key: 'approval',
          type: 'APPROVAL',
          config: { module: ruleModule, level: 1 },
        },
        { id: endId, key: 'end', type: 'END', config: {} },
      ],
      edges: [
        { id: randomUUID(), fromNodeId: startId, toNodeId: approvalId },
        { id: randomUUID(), fromNodeId: approvalId, toNodeId: endId },
      ],
    };

    const workflow = await asTenant(companyId, () =>
      workflowManagement.create({
        companyId,
        name: 'no-approval-needed',
        triggerType: 'MANUAL',
        graph,
      }),
    );
    await asTenant(companyId, () => workflowManagement.publish(workflow.id));

    const result = await asTenant(companyId, () =>
      engine.start(graph, workflow.id, companyId, { requiresApproval: false }),
    );

    expect(result.status).toBe('COMPLETED');
  }, 20000);
});
