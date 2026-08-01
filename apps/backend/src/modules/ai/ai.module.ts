import { Module } from '@nestjs/common';
import { AiFacadeService } from '@modules/ai';
import {
  AiProviderConfigRepository,
  AgentExecutionService,
  AgentOrchestratorService,
  AgentRegistryService,
  ConversationRepository,
  ConversationService,
  MemoryRepository,
  MemoryService,
  RbacPermissionChecker,
  RealAiDecisionProvider,
  ToolRegistryService,
  type ToolExecutor,
  type ToolExecutionContext,
} from '@platform/ai';
import { RealAiProductExpertProvider } from '@modules/products';
import { PgVectorSearchProvider } from '@platform/search';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { CustomerService } from '@modules/customers';
import { ProductService } from '@modules/products';
import { QuotationService } from '@modules/quotations';
import { InventoryService } from '@modules/inventory';
import { SupplierService, RequisitionService, PurchaseOrderService } from '@modules/procurement';
import { DocumentService } from '@modules/document-management';
import { AnalyticsKpiService, AnalyticsForecastService } from '@modules/reports';
import { AiController } from './ai.controller';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { DocumentsModule } from '../documents/documents.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaService } from '../../prisma/prisma.service';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';

/**
 * Builds the closure-based ToolExecutor every Tool.key resolves through — the Agent SDK never
 * imports another module's Repository/Service directly, exactly like OrderService's
 * QuotationLookupPort etc. (docs/DOMAIN_MODEL_PHASE6.md §5/§12). Each closure calls the owning
 * module's own already-published method; `ctx.companyId`/`ctx.userId` are injected here, never
 * accepted as model-controlled tool arguments.
 */
function buildToolExecutor(deps: {
  customers: CustomerService;
  products: ProductService;
  productExpert: RealAiProductExpertProvider;
  quotations: QuotationService;
  inventory: InventoryService;
  suppliers: SupplierService;
  requisitions: RequisitionService;
  purchaseOrders: PurchaseOrderService;
  documents: DocumentService;
  analyticsKpis: AnalyticsKpiService;
  analyticsForecasts: AnalyticsForecastService;
}): ToolExecutor {
  const handlers: Record<
    string,
    (input: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>
  > = {
    'customers.getById': (input) => deps.customers.getById(input.customerId as string),
    'customers.checkCredit': (input) =>
      deps.customers.checkCredit(input.customerId as string, input.proposedOrderTotal as number),
    'products.getEffectivePrice': (input, ctx) =>
      deps.products.getEffectivePrice(ctx.companyId, input.productId as string, {
        quantity: input.quantity as number,
        currency: input.currency as string,
        customerId: input.customerId as string | undefined,
      }),
    'products.ragAsk': (input) =>
      deps.productExpert.ask({
        productId: input.productId as string,
        question: input.question as string,
      }),
    'quotations.createFromRfq': (input, ctx) =>
      deps.quotations.createFromRfq(
        ctx.companyId,
        {
          quotationNumber: input.quotationNumber as string,
          rfqId: input.rfqId as string,
          lineItems: input.lineItems as never,
        },
        ctx.userId,
      ),
    'quotations.createDirect': (input, ctx) =>
      deps.quotations.createDirect(
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
      deps.quotations.requestApproval(input.quotationId as string, ctx.userId),
    'quotations.send': (input, ctx) =>
      deps.quotations.send(input.quotationId as string, ctx.userId),

    'inventory.getInventoryItem': (input) =>
      deps.inventory.getInventoryItem(input.inventoryItemId as string),
    'inventory.adjustStock': (input, ctx) =>
      deps.inventory.adjustStock(
        ctx.companyId,
        input.inventoryItemId as string,
        input.quantityDelta as number,
        input.reason as string,
        ctx.userId,
      ),
    'procurement.getSupplier': (input) => deps.suppliers.getById(input.supplierId as string),
    'procurement.createRequisition': (input, ctx) =>
      deps.requisitions.create(
        {
          companyId: ctx.companyId,
          requisitionNumber: input.requisitionNumber as string,
          requestedByUserId: ctx.userId,
          lineItems: input.lineItems as never,
        },
        ctx.userId,
      ),
    'procurement.submitRequisition': (input, ctx) =>
      deps.requisitions.submit(input.requisitionId as string, ctx.userId),
    'procurement.createPurchaseOrderFromRequisition': (input, ctx) =>
      deps.purchaseOrders.createFromRequisition(
        ctx.companyId,
        input.poNumber as string,
        input.requisitionId as string,
        input.supplierId as string,
        input.currency as string,
        ctx.userId,
      ),

    'knowledge.search': (input, ctx) =>
      deps.documents.search(
        ctx.companyId,
        input.query as string,
        { limit: input.limit as number | undefined },
        'semantic',
      ),
    'knowledge.getDocument': (input) => deps.documents.getById(input.documentId as string),

    'analytics.queryKpis': (input, ctx) => {
      switch (input.section as string) {
        case 'executive':
          return deps.analyticsKpis.getExecutiveKpis(ctx.companyId);
        case 'sales':
          return deps.analyticsKpis.getSalesKpis(ctx.companyId);
        case 'trading':
          return deps.analyticsKpis.getTradingKpis(ctx.companyId);
        case 'finance':
          return deps.analyticsKpis.getFinanceKpis(ctx.companyId);
        case 'inventory':
          return deps.analyticsKpis.getInventoryKpis(ctx.companyId);
        case 'procurement':
          return deps.analyticsKpis.getProcurementKpis(ctx.companyId);
        case 'ai':
          return deps.analyticsKpis.getAiKpis(ctx.companyId);
        default:
          throw new Error(`Unknown analytics section "${String(input.section)}".`);
      }
    },
    'analytics.getForecast': (_input, ctx) =>
      deps.analyticsForecasts.getLatestSalesForecast(ctx.companyId),
  };

  return {
    execute: (toolKey, input, ctx) => {
      const handler = handlers[toolKey];
      if (!handler) throw new Error(`No ToolExecutor handler bound for tool "${toolKey}".`);
      return handler(input, ctx);
    },
  };
}

@Module({
  imports: [
    CustomersModule,
    ProductsModule,
    QuotationsModule,
    InventoryModule,
    ProcurementModule,
    DocumentsModule,
    AnalyticsModule,
  ],
  controllers: [AiController],
  providers: [
    {
      provide: AiFacadeService,
      useFactory: (
        prisma: PrismaService,
        customers: CustomerService,
        products: ProductService,
        quotations: QuotationService,
        inventory: InventoryService,
        suppliers: SupplierService,
        requisitions: RequisitionService,
        purchaseOrders: PurchaseOrderService,
        documents: DocumentService,
        analyticsKpis: AnalyticsKpiService,
        analyticsForecasts: AnalyticsForecastService,
      ) => {
        const db = prisma.client;
        const aiRouter = buildAiRouter(db);
        const prompts = buildPromptTemplateService(db);

        const agentRegistry = new AgentRegistryService(db);
        const toolRegistry = new ToolRegistryService(db);
        const executionService = new AgentExecutionService(db);
        const conversationService = new ConversationService(new ConversationRepository(db));
        const memoryService = new MemoryService(new MemoryRepository(db));
        const permissionChecker = new RbacPermissionChecker(db);
        const providerConfigRepo = new AiProviderConfigRepository(db);

        const eventBus = new RedisStreamsEventBus();
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
        });
        const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
          new LegacyApprovalRuleSource(db),
          new NativeRuleSource((companyId, module) =>
            ruleRepository.loadApplicable(companyId, module),
          ),
        ]);

        const productExpert = new RealAiProductExpertProvider(
          aiRouter,
          prompts,
          products,
          new PgVectorSearchProvider(db, aiRouter),
        );

        const toolExecutor = buildToolExecutor({
          customers,
          products,
          productExpert,
          quotations,
          inventory,
          suppliers,
          requisitions,
          purchaseOrders,
          documents,
          analyticsKpis,
          analyticsForecasts,
        });

        const orchestrator = new AgentOrchestratorService({
          prisma: db,
          aiRouter,
          prompts,
          agentRegistry,
          toolRegistry,
          executionService,
          conversationService,
          permissionChecker,
          approvalEvaluator,
          toolExecutor,
        });

        return new AiFacadeService(
          orchestrator,
          agentRegistry,
          toolRegistry,
          executionService,
          memoryService,
          providerConfigRepo,
        );
      },
      inject: [
        PrismaService,
        CustomerService,
        ProductService,
        QuotationService,
        InventoryService,
        SupplierService,
        RequisitionService,
        PurchaseOrderService,
        DocumentService,
        AnalyticsKpiService,
        AnalyticsForecastService,
      ],
    },
  ],
})
export class AiModule {}
