/**
 * Real composed AgentOrchestratorService (same wiring as
 * apps/backend/src/modules/ai/ai.module.ts) running the Analytics Assistant against real
 * Postgres + local Ollama — no mocks. Asks the agent a natural-language question about AI
 * usage, and asserts it made a real `analytics.queryKpis` tool call (backed by real
 * AnalyticsKpiService Prisma queries) with a real AgentExecution/ToolExecution trail — the
 * real substance behind doc 20's Natural Language Analytics. See
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section.
 *
 * Note: this mirrors ai-agents-tool-calling.e2e-spec.ts's exact shape, including that file's
 * documented pre-existing flakiness (~1/5 runs) against the local qwen2.5:3b model — an
 * occasional failure here reflects that same known characteristic, not a regression.
 *
 * Requires DATABASE_URL and a local Ollama daemon with `qwen2.5:3b` pulled.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { PermissionAction } from '@platform/types';
import { permissionCode } from '@platform/permissions';
import {
  AGENT_DEFINITIONS,
  TOOL_DEFINITIONS,
  AgentExecutionService,
  AgentOrchestratorService,
  AgentRegistryService,
  ConversationRepository,
  ConversationService,
  RbacPermissionChecker,
  ToolRegistryService,
  type ToolExecutor,
} from '@platform/ai';
import {
  AnalyticsKpiService,
  AnalyticsForecastService,
  AnalyticsHistoryRepository,
  type FinanceReportsPort,
} from '@modules/reports';
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

const ANALYTICS_AGENT_PERMISSIONS: Array<{ module: string; action: PermissionAction }> = [
  { module: 'analytics', action: PermissionAction.VIEW },
];

describe('AI agents tool-calling (live Postgres + local Ollama, Analytics Assistant)', () => {
  let companyId: string;
  let userId: string;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    await withoutTenant(() =>
      Promise.all(
        ANALYTICS_AGENT_PERMISSIONS.map((p) =>
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
          companyCode: `TEST-ANALYTICS-AGENT-${Date.now()}`,
          legalName: 'Analytics Agent Test Co',
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
          firstName: 'Analytics',
          lastName: 'AgentTester',
          email: `analytics-agent-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const role = await withoutTenant(() =>
      rawDb.role.create({
        data: { companyId, name: 'Analytics Agent Test Role', isSystemRole: false },
      }),
    );
    const permissions = await withoutTenant(() =>
      rawDb.permission.findMany({
        where: {
          code: { in: ANALYTICS_AGENT_PERMISSIONS.map((p) => permissionCode(p.module, p.action)) },
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
          defaultEmbedModel: 'nomic-embed-text',
        },
      }),
    );

    const aiRouter = buildAiRouter(db);
    const prompts = buildPromptTemplateService(db);

    const agentRegistry = new AgentRegistryService(db);
    const toolRegistry = new ToolRegistryService(db);
    await agentRegistry.sync(AGENT_DEFINITIONS);
    await toolRegistry.sync(TOOL_DEFINITIONS);

    const analyticsKpis = new AnalyticsKpiService(db, NOOP_FINANCE_REPORTS);
    const analyticsAudit = { record: async () => {} };
    const analyticsForecasts = new AnalyticsForecastService(
      analyticsKpis,
      analyticsAudit,
      new AnalyticsHistoryRepository(db),
    );

    const handlers: Record<
      string,
      (
        input: Record<string, unknown>,
        ctx: { companyId: string; userId: string },
      ) => Promise<unknown>
    > = {
      'analytics.queryKpis': (input, ctx) => {
        switch (input.section as string) {
          case 'executive':
            return analyticsKpis.getExecutiveKpis(ctx.companyId);
          case 'sales':
            return analyticsKpis.getSalesKpis(ctx.companyId);
          case 'trading':
            return analyticsKpis.getTradingKpis(ctx.companyId);
          case 'finance':
            return analyticsKpis.getFinanceKpis(ctx.companyId);
          case 'inventory':
            return analyticsKpis.getInventoryKpis(ctx.companyId);
          case 'procurement':
            return analyticsKpis.getProcurementKpis(ctx.companyId);
          case 'ai':
            return analyticsKpis.getAiKpis(ctx.companyId);
          default:
            throw new Error(`Unknown analytics section "${String(input.section)}".`);
        }
      },
      'analytics.getForecast': (_input, ctx) =>
        analyticsForecasts.getLatestSalesForecast(ctx.companyId),
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
      approvalEvaluator: { evaluateApproval: async () => ({ approvers: [], matchedRuleIds: [] }) },
      toolExecutor,
    });
  }, 60000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.toolExecution.deleteMany({ where: { agentExecution: { companyId } } });
      await rawDb.agentExecution.deleteMany({ where: { companyId } });
      await rawDb.conversationMessage.deleteMany({ where: { conversation: { companyId } } });
      await rawDb.conversation.deleteMany({ where: { companyId } });
      await rawDb.aiUsageRecord.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.userRole.deleteMany({ where: { userId } });
      await rawDb.rolePermission.deleteMany({ where: { role: { companyId } } });
      await rawDb.role.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('answers a real natural-language KPI question via a real analytics.queryKpis tool call', async () => {
    const message =
      'What is our current AI automation rate? Please check the AI dashboard section.';

    const execution = await asCompany(companyId, userId, () =>
      orchestrator.run('analytics-agent', companyId, userId, message),
    );

    expect(execution.status).toBe('COMPLETED');

    const toolExecutions = await withoutTenant(() =>
      rawDb.toolExecution.findMany({
        where: { agentExecutionId: execution.id },
        include: { tool: true },
      }),
    );
    const queryExecution = toolExecutions.find((te) => te.tool.key === 'analytics.queryKpis');
    expect(queryExecution).toBeDefined();
    expect(queryExecution!.status).toBe('SUCCEEDED');
  }, 90000);
});
