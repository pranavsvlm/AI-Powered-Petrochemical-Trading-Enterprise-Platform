/**
 * Real composed AgentOrchestratorService (same wiring as
 * apps/backend/src/modules/ai/ai.module.ts) running the HR Assistant against real Postgres +
 * local Ollama — no mocks. Asks the agent a natural-language question about an employee, and
 * asserts it made a real `hr.getEmployee` tool call (backed by real EmployeeService Prisma
 * queries) with a real AgentExecution/ToolExecution trail — the real substance behind doc 15's
 * "answer HR policy/employee questions" bullet. See docs/DOMAIN_MODEL_PHASE7.md, HR section.
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
  EmployeeService,
  LeaveService,
  type DepartmentLookupPort,
  type TeamLookupPort,
} from '@modules/hr';
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

const HR_AGENT_PERMISSIONS: Array<{ module: string; action: PermissionAction }> = [
  { module: 'hr', action: PermissionAction.VIEW },
];

describe('AI agents tool-calling (live Postgres + local Ollama, HR Assistant)', () => {
  let companyId: string;
  let userId: string;
  let employeeId: string;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    await withoutTenant(() =>
      Promise.all(
        HR_AGENT_PERMISSIONS.map((p) =>
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
          companyCode: `TEST-HR-AGENT-${Date.now()}`,
          legalName: 'HR Agent Test Co',
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
          firstName: 'HR',
          lastName: 'AgentTester',
          email: `hr-agent-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const employee = await withoutTenant(() =>
      rawDb.employee.create({
        data: {
          companyId,
          userId,
          employeeNumber: `EMP-AGENT-${Date.now()}`,
          jobTitle: 'Senior Trading Analyst',
          employmentType: 'FULL_TIME',
          hireDate: new Date('2024-05-01'),
        },
      }),
    );
    employeeId = employee.id;

    const role = await withoutTenant(() =>
      rawDb.role.create({ data: { companyId, name: 'HR Agent Test Role', isSystemRole: false } }),
    );
    const permissions = await withoutTenant(() =>
      rawDb.permission.findMany({
        where: {
          code: { in: HR_AGENT_PERMISSIONS.map((p) => permissionCode(p.module, p.action)) },
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

    const departments: DepartmentLookupPort = { getById: async () => null };
    const teams: TeamLookupPort = { getById: async () => null };
    const hrAudit = { record: async () => {} };
    const employeeService = new EmployeeService(db, departments, teams, hrAudit);
    const leaveService = new LeaveService(
      db,
      { evaluateApproval: async () => ({ approvers: [], matchedRuleIds: [] }) },
      hrAudit,
    );

    const handlers: Record<
      string,
      (
        input: Record<string, unknown>,
        ctx: { companyId: string; userId: string },
      ) => Promise<unknown>
    > = {
      'hr.getEmployee': (input) => employeeService.getById(input.employeeId as string),
      'hr.getLeaveBalance': (input) =>
        leaveService
          .getBalance(input.employeeId as string, input.policyId as string)
          .then((balance) => ({ balance })),
      'hr.listTeamRoster': (input) => employeeService.listDirectReports(input.managerId as string),
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
      await rawDb.employee.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('answers a real natural-language employee-lookup question via a real hr.getEmployee tool call', async () => {
    const message = `What is the job title of employee id ${employeeId}? Please look them up.`;

    const execution = await asCompany(companyId, userId, () =>
      orchestrator.run('hr-agent', companyId, userId, message),
    );

    expect(execution.status).toBe('COMPLETED');

    const toolExecutions = await withoutTenant(() =>
      rawDb.toolExecution.findMany({
        where: { agentExecutionId: execution.id },
        include: { tool: true },
      }),
    );
    const getEmployeeExecution = toolExecutions.find((te) => te.tool.key === 'hr.getEmployee');
    expect(getEmployeeExecution).toBeDefined();
    expect(getEmployeeExecution!.status).toBe('SUCCEEDED');
  }, 90000);
});
