/**
 * Real composed AgentOrchestratorService (same wiring as
 * apps/backend/src/modules/ai/ai.module.ts) running the Inventory Agent against real Postgres
 * + local Ollama — no mocks. `inventory.adjustStock` has `requiresHumanApproval: true`, so
 * this proves the human-approval pause/resume genuinely routes through the real
 * ApprovalRequest table / RuleEvaluationService, not a parallel mechanism — see
 * docs/DOMAIN_MODEL_PHASE6.md §10.
 *
 * Requires DATABASE_URL and a local Ollama daemon with `qwen2.5:3b` pulled (see
 * ai-chat-completion.e2e-spec.ts for why qwen2.5:3b, not llama3.2:1b).
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { PermissionAction } from '@platform/types';
import { permissionCode } from '@platform/permissions';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import {
  AGENT_DEFINITIONS,
  TOOL_DEFINITIONS,
  RealAiDecisionProvider,
  AgentExecutionService,
  AgentOrchestratorService,
  AgentRegistryService,
  ConversationRepository,
  ConversationService,
  RbacPermissionChecker,
  ToolRegistryService,
  type ToolExecutor,
} from '@platform/ai';
import { InventoryService } from '@modules/inventory';
import { buildAiRouter, buildPromptTemplateService } from '../src/common/ai/ai-factory';

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

const INVENTORY_AGENT_PERMISSIONS: Array<{ module: string; action: PermissionAction }> = [
  { module: 'inventory', action: PermissionAction.VIEW },
  { module: 'inventory', action: PermissionAction.EDIT },
  { module: 'procurement', action: PermissionAction.VIEW },
  { module: 'procurement', action: PermissionAction.CREATE },
  { module: 'procurement', action: PermissionAction.APPROVE },
];

describe('AI approval routing (live Postgres + local Ollama, Inventory Agent)', () => {
  let companyId: string;
  let userId: string;
  let approverUserId: string;
  let inventoryItemId: string;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    await withoutTenant(() =>
      Promise.all(
        INVENTORY_AGENT_PERMISSIONS.map((p) =>
          rawDb.permission.upsert({
            where: { code: permissionCode(p.module, p.action) },
            create: {
              code: permissionCode(p.module, p.action),
              module: p.module,
              action: p.action,
            },
            update: {},
          }),
        ),
      ),
    );

    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-AI-APPROVAL-${Date.now()}`,
          legalName: 'AI Approval Test Co',
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
          firstName: 'Agent',
          lastName: 'Requester',
          email: `agent-requester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const approver = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Agent',
          lastName: 'Approver',
          email: `agent-approver-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    approverUserId = approver.id;

    const role = await withoutTenant(() =>
      rawDb.role.create({
        data: { companyId, name: 'Inventory Agent Test Role', isSystemRole: false },
      }),
    );
    const permissions = await withoutTenant(() =>
      rawDb.permission.findMany({
        where: {
          code: { in: INVENTORY_AGENT_PERMISSIONS.map((p) => permissionCode(p.module, p.action)) },
        },
      }),
    );
    await withoutTenant(() =>
      rawDb.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      }),
    );
    await withoutTenant(() => rawDb.userRole.create({ data: { userId, roleId: role.id } }));

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

    const product = await withoutTenant(() =>
      rawDb.product.create({
        data: {
          companyId,
          sku: `SKU-INV-${Date.now()}`,
          name: 'Toluene',
          baseUom: 'MT',
          status: 'ACTIVE',
        },
      }),
    );
    const warehouse = await withoutTenant(() =>
      rawDb.warehouse.create({
        data: { companyId, code: 'WH-E2E', name: 'E2E Warehouse', isDefault: true },
      }),
    );
    const inventoryItem = await withoutTenant(() =>
      rawDb.inventoryItem.create({
        data: { companyId, productId: product.id, warehouseId: warehouse.id, quantityOnHand: 100 },
      }),
    );
    inventoryItemId = inventoryItem.id;

    const agentRegistry = new AgentRegistryService(db);
    const toolRegistry = new ToolRegistryService(db);
    await agentRegistry.sync(AGENT_DEFINITIONS);
    await toolRegistry.sync(TOOL_DEFINITIONS);

    const eventBus = new RedisStreamsEventBus();
    const aiRouter = buildAiRouter(db);
    const prompts = buildPromptTemplateService(db);
    const ruleRepository = new RuleRepository(db);
    const ruleActionExecutor = new RuleActionExecutor({
      eventBus,
      aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
    });
    const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
      new LegacyApprovalRuleSource(db),
      new NativeRuleSource((cid, module) => ruleRepository.loadApplicable(cid, module)),
    ]);
    const audit = { record: async () => {} };
    const inventoryService = new InventoryService(db, eventBus, audit);

    const handlers: Record<
      string,
      (
        input: Record<string, unknown>,
        ctx: { companyId: string; userId: string },
      ) => Promise<unknown>
    > = {
      'inventory.getInventoryItem': (input) =>
        inventoryService.getInventoryItem(input.inventoryItemId as string),
      'inventory.adjustStock': (input, ctx) =>
        inventoryService.adjustStock(
          ctx.companyId,
          input.inventoryItemId as string,
          input.quantityDelta as number,
          input.reason as string,
          ctx.userId,
        ),
    };
    const toolExecutor: ToolExecutor = {
      execute: (toolKey, input, ctx) => {
        const handler = handlers[toolKey];
        if (!handler) throw new Error(`No handler bound for tool "${toolKey}".`);
        return handler(input, ctx);
      },
    };

    orchestrator = new AgentOrchestratorService({
      prisma: db,
      aiRouter,
      prompts,
      agentRegistry,
      toolRegistry,
      executionService: new AgentExecutionService(db),
      conversationService: new ConversationService(new ConversationRepository(db)),
      permissionChecker: new RbacPermissionChecker(db),
      approvalEvaluator,
      toolExecutor,
    });
  }, 60000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.toolExecution.deleteMany({ where: { agentExecution: { companyId } } });
      await rawDb.approvalRequest.deleteMany({ where: { companyId } });
      await rawDb.agentExecution.deleteMany({ where: { companyId } });
      await rawDb.conversationMessage.deleteMany({ where: { conversation: { companyId } } });
      await rawDb.conversation.deleteMany({ where: { companyId } });
      await rawDb.aiUsageRecord.deleteMany({ where: { companyId } });
      await rawDb.stockAdjustment.deleteMany({ where: { companyId } }).catch(() => {});
      await rawDb.inventoryMovement.deleteMany({ where: { companyId } }).catch(() => {});
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.userRole.deleteMany({ where: { userId } });
      await rawDb.rolePermission.deleteMany({ where: { role: { companyId } } });
      await rawDb.role.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('pauses at AWAITING_APPROVAL with a real ApprovalRequest, then resumes and executes the real stock adjustment once approved', async () => {
    const message = `Adjust stock for inventory item ${inventoryItemId}: decrease by 15 units, reason "cycle count correction".`;

    const paused = await asCompany(companyId, userId, () =>
      orchestrator.run('inventory-agent', companyId, userId, message),
    );

    expect(paused.status).toBe('AWAITING_APPROVAL');

    const pausedToolExecutions = await withoutTenant(() =>
      rawDb.toolExecution.findMany({
        where: { agentExecutionId: paused.id },
        include: { tool: true },
      }),
    );
    const adjustStockExecution = pausedToolExecutions.find(
      (te) => te.tool.key === 'inventory.adjustStock',
    );
    expect(adjustStockExecution).toBeDefined();
    expect(adjustStockExecution!.status).toBe('AWAITING_APPROVAL');
    expect(adjustStockExecution!.approvalRequestId).toBeTruthy();

    const approvalRequest = await withoutTenant(() =>
      rawDb.approvalRequest.findUnique({ where: { id: adjustStockExecution!.approvalRequestId! } }),
    );
    expect(approvalRequest).toMatchObject({
      companyId,
      entityType: 'ToolExecution',
      entityId: adjustStockExecution!.id,
      status: 'PENDING',
    });

    const itemBeforeApproval = await withoutTenant(() =>
      rawDb.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
    );
    expect(Number(itemBeforeApproval!.quantityOnHand)).toBe(100);

    const resumed = await asCompany(companyId, approverUserId, () =>
      orchestrator.resumeAfterApproval(
        paused.id,
        companyId,
        'APPROVED',
        approverUserId,
        'looks correct',
      ),
    );

    expect(resumed.status).toBe('COMPLETED');

    const decidedApproval = await withoutTenant(() =>
      rawDb.approvalRequest.findUnique({ where: { id: approvalRequest!.id } }),
    );
    expect(decidedApproval!.status).toBe('APPROVED');

    const resumedToolExecution = await withoutTenant(() =>
      rawDb.toolExecution.findUnique({ where: { id: adjustStockExecution!.id } }),
    );
    expect(resumedToolExecution!.status).toBe('SUCCEEDED');

    const itemAfterApproval = await withoutTenant(() =>
      rawDb.inventoryItem.findUnique({ where: { id: inventoryItemId } }),
    );
    expect(Number(itemAfterApproval!.quantityOnHand)).toBe(85);
  }, 90000);
});
