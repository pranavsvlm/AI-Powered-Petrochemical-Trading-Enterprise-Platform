/**
 * Real composed AgentOrchestratorService (same wiring as
 * apps/backend/src/modules/ai/ai.module.ts) running the Sales Agent against real Postgres +
 * local Ollama — no mocks. Asks the agent to create a direct quotation for a seeded
 * customer/product, and asserts a real Quotation row is created via the tool call, plus a
 * real AgentExecution/ToolExecution trail. See docs/DOMAIN_MODEL_PHASE6.md §12.
 *
 * Uses `quotations.createDirect` rather than `createFromRfq` — both are valid
 * Quotation-row-creating tool calls the Sales Agent owns; createDirect needs fewer
 * prerequisite rows (no RFQ) and keeps this test focused on tool-calling mechanics.
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
  MemoryRepository,
  MemoryService,
  RbacPermissionChecker,
  ToolRegistryService,
  type ToolExecutor,
} from '@platform/ai';
import { RealAiProductExpertProvider, ProductService } from '@modules/products';
import { CustomerService, type CustomerAuditReader } from '@modules/customers';
import {
  QuotationService,
  type CustomerLookupPort,
  type PricingLookupPort,
  RfqService,
} from '@modules/quotations';
import { PgVectorSearchProvider } from '@platform/search';
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

const SALES_AGENT_PERMISSIONS: Array<{ module: string; action: PermissionAction }> = [
  { module: 'customers', action: PermissionAction.VIEW },
  { module: 'products', action: PermissionAction.VIEW },
  { module: 'products', action: PermissionAction.EXECUTE_AI },
  { module: 'quotations', action: PermissionAction.CREATE },
  { module: 'quotations', action: PermissionAction.APPROVE },
  { module: 'quotations', action: PermissionAction.EDIT },
];

describe('AI agents tool-calling (live Postgres + local Ollama, Sales Agent)', () => {
  let companyId: string;
  let userId: string;
  let customerId: string;
  let productId: string;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    await withoutTenant(() =>
      Promise.all(
        SALES_AGENT_PERMISSIONS.map((p) =>
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
          companyCode: `TEST-AI-AGENT-${Date.now()}`,
          legalName: 'AI Agent Test Co',
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
          lastName: 'Tester',
          email: `agent-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const role = await withoutTenant(() =>
      rawDb.role.create({
        data: { companyId, name: 'Sales Agent Test Role', isSystemRole: false },
      }),
    );
    const permissions = await withoutTenant(() =>
      rawDb.permission.findMany({
        where: {
          code: { in: SALES_AGENT_PERMISSIONS.map((p) => permissionCode(p.module, p.action)) },
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

    // Seed Customer + Product + PriceList via the real services, same as
    // rfq-quotation-order-lifecycle.e2e-spec.ts's approach.
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
    const auditReader: CustomerAuditReader = { listForEntity: async () => [] };
    const customerService = new CustomerService(
      db,
      approvalEvaluator,
      eventBus,
      audit,
      auditReader,
    );
    const productService = new ProductService(db, approvalEvaluator, eventBus, audit);

    const customer = await asCompany(companyId, userId, () =>
      customerService.create(
        {
          companyId,
          customerCode: `CUST-${Date.now()}`,
          legalName: 'Acme Petrochem Buyers',
          country: 'US',
          currency: 'USD',
        },
        userId,
      ),
    );
    customerId = customer.id;

    const product = await asCompany(companyId, userId, () =>
      productService.create(
        { companyId, sku: `SKU-${Date.now()}`, name: 'Benzene', baseUom: 'MT' },
        userId,
      ),
    );
    productId = product.id;
    await asCompany(companyId, userId, () =>
      productService.upsertPriceListEntry(
        {
          companyId,
          productId,
          currency: 'USD',
          uom: 'MT',
          minQuantity: 1,
          unitPrice: 500,
        },
        userId,
      ),
    );

    // Sync the code-defined Agent/Tool catalog — this test runs standalone, not through the
    // full Nest app boot, so AiModule's OnModuleInit sync never ran for it.
    const agentRegistry = new AgentRegistryService(db);
    const toolRegistry = new ToolRegistryService(db);
    await agentRegistry.sync(AGENT_DEFINITIONS);
    await toolRegistry.sync(TOOL_DEFINITIONS);

    const productExpert = new RealAiProductExpertProvider(
      aiRouter,
      prompts,
      productService,
      new PgVectorSearchProvider(db, aiRouter),
    );
    const rfqService = new RfqService(
      db,
      eventBus,
      audit,
      { getById: (id) => customerService.getById(id) },
      {
        getById: (id) => productService.getById(id),
      },
    );
    const pricing: PricingLookupPort = {
      getEffectivePrice: (cid, pid, query) => productService.getEffectivePrice(cid, pid, query),
    };
    const customerLookup: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
    const quotationService = new QuotationService(
      db,
      approvalEvaluator,
      eventBus,
      audit,
      pricing,
      rfqService,
      customerLookup,
    );

    const handlers: Record<
      string,
      (
        input: Record<string, unknown>,
        ctx: { companyId: string; userId: string },
      ) => Promise<unknown>
    > = {
      'customers.getById': (input) => customerService.getById(input.customerId as string),
      'customers.checkCredit': (input) =>
        customerService.checkCredit(input.customerId as string, input.proposedOrderTotal as number),
      'products.getEffectivePrice': (input, ctx) =>
        productService.getEffectivePrice(ctx.companyId, input.productId as string, {
          quantity: input.quantity as number,
          currency: input.currency as string,
          customerId: input.customerId as string | undefined,
        }),
      'products.ragAsk': (input) =>
        productExpert.ask({
          productId: input.productId as string,
          question: input.question as string,
        }),
      'quotations.createDirect': (input, ctx) =>
        quotationService.createDirect(
          ctx.companyId,
          {
            quotationNumber: input.quotationNumber as string,
            customerId: input.customerId as string,
            currency: input.currency as string,
            lineItems: input.lineItems as never,
          },
          ctx.userId,
        ),
      'quotations.requestApproval': (input, ctx) =>
        quotationService.requestApproval(input.quotationId as string, ctx.userId),
      'quotations.send': (input, ctx) =>
        quotationService.send(input.quotationId as string, ctx.userId),
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
      await rawDb.quotationLineItem.deleteMany({
        where: { quotationVersion: { quotation: { companyId } } },
      });
      await rawDb.quotationVersion.deleteMany({ where: { quotation: { companyId } } });
      await rawDb.quotation.deleteMany({ where: { companyId } });
      await rawDb.toolExecution.deleteMany({ where: { agentExecution: { companyId } } });
      await rawDb.agentExecution.deleteMany({ where: { companyId } });
      await rawDb.conversationMessage.deleteMany({ where: { conversation: { companyId } } });
      await rawDb.conversation.deleteMany({ where: { companyId } });
      await rawDb.aiUsageRecord.deleteMany({ where: { companyId } });
      await rawDb.priceList.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.userRole.deleteMany({ where: { userId } });
      await rawDb.rolePermission.deleteMany({ where: { role: { companyId } } });
      await rawDb.role.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('creates a real Quotation via a real tool call, leaving a real AgentExecution/ToolExecution trail', async () => {
    const message = `Create a direct quotation for customer id ${customerId}, currency USD, quotation number Q-E2E-${Date.now()}, with one line item: product id ${productId}, quantity 20.`;

    const execution = await asCompany(companyId, userId, () =>
      orchestrator.run('sales-agent', companyId, userId, message),
    );

    expect(execution.status).toBe('COMPLETED');

    const toolExecutions = await withoutTenant(() =>
      rawDb.toolExecution.findMany({
        where: { agentExecutionId: execution.id },
        include: { tool: true },
      }),
    );
    const createDirectExecution = toolExecutions.find(
      (te) => te.tool.key === 'quotations.createDirect',
    );
    expect(createDirectExecution).toBeDefined();
    expect(createDirectExecution!.status).toBe('SUCCEEDED');

    const quotations = await withoutTenant(() =>
      rawDb.quotation.findMany({ where: { customerId } }),
    );
    expect(quotations).toHaveLength(1);
    expect(quotations[0]).toMatchObject({ customerId, currency: 'USD' });
  }, 90000);
});
