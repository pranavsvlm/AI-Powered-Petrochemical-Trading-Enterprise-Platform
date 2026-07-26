import { Module } from '@nestjs/common';
import {
  SupplierService,
  RequisitionService,
  PurchaseOrderService,
  GoodsReceiptService,
  type ProductLookupPort,
  type RequisitionLookupPort,
  type WarehouseLookupPort,
  type InventoryReceiptPort,
} from '@modules/procurement';
import { InventoryService } from '@modules/inventory';
import { ProductService } from '@modules/products';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { SuppliersController } from './suppliers.controller';
import { RequisitionsController } from './requisitions.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [InventoryModule, ProductsModule],
  controllers: [
    SuppliersController,
    RequisitionsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
  ],
  providers: [
    AuditService,
    {
      provide: SupplierService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new SupplierService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: RequisitionService,
      useFactory: (prisma: PrismaService, audit: AuditService, productService: ProductService) => {
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
        const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
        return new RequisitionService(db, approvalEvaluator, audit, products);
      },
      inject: [PrismaService, AuditService, ProductService],
    },
    {
      provide: PurchaseOrderService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        supplierService: SupplierService,
        productService: ProductService,
        requisitionService: RequisitionService,
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
        const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
        const requisitions: RequisitionLookupPort = {
          getForPurchaseOrderCreation: (id) => requisitionService.getForPurchaseOrderCreation(id),
          markConverted: (id, actorUserId) => requisitionService.markConverted(id, actorUserId),
        };
        return new PurchaseOrderService(
          db,
          approvalEvaluator,
          eventBus,
          audit,
          supplierService,
          products,
          requisitions,
        );
      },
      inject: [PrismaService, AuditService, SupplierService, ProductService, RequisitionService],
    },
    {
      provide: GoodsReceiptService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        inventoryService: InventoryService,
        purchaseOrderService: PurchaseOrderService,
      ) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        const warehouses: WarehouseLookupPort = {
          getWarehouseById: (id) => inventoryService.getWarehouseById(id),
        };
        const inventory: InventoryReceiptPort = {
          recordReceipt: (input) => inventoryService.recordReceipt(input),
        };
        return new GoodsReceiptService(
          db,
          eventBus,
          audit,
          warehouses,
          inventory,
          purchaseOrderService,
        );
      },
      inject: [PrismaService, AuditService, InventoryService, PurchaseOrderService],
    },
  ],
  exports: [SupplierService, RequisitionService, PurchaseOrderService, GoodsReceiptService],
})
export class ProcurementModule {}
