import { Module } from '@nestjs/common';
import {
  OrderService,
  type QuotationLookupPort,
  type CustomerLookupPort,
  type ProductLookupPort,
  type InventoryReservePort,
  type InventoryReleasePort,
  type InventoryCommitPort,
  type InvoicingPort,
} from '@modules/orders';
import { QuotationService } from '@modules/quotations';
import { ProductService } from '@modules/products';
import { CustomerService } from '@modules/customers';
import { InventoryService } from '@modules/inventory';
import { InvoiceService } from '@modules/accounting';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { OrdersController } from './orders.controller';
import { QuotationsModule } from '../quotations/quotations.module';
import { ProductsModule } from '../products/products.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [QuotationsModule, ProductsModule, CustomersModule, InventoryModule, AccountingModule],
  controllers: [OrdersController],
  providers: [
    AuditService,
    {
      provide: OrderService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        quotationService: QuotationService,
        productService: ProductService,
        customerService: CustomerService,
        inventoryService: InventoryService,
        invoiceService: InvoiceService,
      ) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new NotImplementedAiDecisionProvider(),
        });
        const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
          new LegacyApprovalRuleSource(db),
          new NativeRuleSource((companyId, module) =>
            ruleRepository.loadApplicable(companyId, module),
          ),
        ]);
        // All calls route through the owning module's own published method — never a raw query
        // against quotations'/products'/customers'/inventory's tables. See
        // docs/DOMAIN_MODEL_PHASE4.md §11 and docs/DOMAIN_MODEL_PHASE5.md.
        const quotationLookup: QuotationLookupPort = {
          getForOrderCreation: (quotationId) => quotationService.getForOrderCreation(quotationId),
          markConverted: async (quotationId, actorUserId) => {
            await quotationService.convertToOrder(quotationId, actorUserId);
          },
        };
        const customers: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
        const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
        const inventoryReserve: InventoryReservePort = {
          reserve: (tx, companyId, orderId, lines, warehouseId) =>
            inventoryService.reserve(tx, companyId, orderId, lines, warehouseId),
        };
        const inventoryRelease: InventoryReleasePort = {
          release: (companyId, orderId) => inventoryService.release(companyId, orderId),
        };
        const inventoryCommit: InventoryCommitPort = {
          commit: (companyId, orderId) => inventoryService.commit(companyId, orderId),
          reverseCommit: (companyId, orderId) => inventoryService.reverseCommit(companyId, orderId),
        };
        const invoicing: InvoicingPort = {
          generateInvoiceForOrder: (order, actorUserId) =>
            invoiceService.generateInvoiceForOrder(order, actorUserId),
        };
        return new OrderService(
          db,
          approvalEvaluator,
          eventBus,
          audit,
          quotationLookup,
          customers,
          products,
          inventoryReserve,
          inventoryRelease,
          inventoryCommit,
          invoicing,
        );
      },
      inject: [
        PrismaService,
        AuditService,
        QuotationService,
        ProductService,
        CustomerService,
        InventoryService,
        InvoiceService,
      ],
    },
  ],
  exports: [OrderService],
})
export class OrdersModule {}
