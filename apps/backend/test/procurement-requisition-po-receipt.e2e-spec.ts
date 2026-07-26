/**
 * Requisition -> PurchaseOrder -> GoodsReceipt journey (doc 17) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE5.md. Exercises the actual composed Supplier/Requisition/
 * PurchaseOrder/GoodsReceipt/Inventory services with the same cross-module wiring as
 * apps/backend/src/modules/procurement/procurement.module.ts, not mocks. Asserts that a goods
 * receipt with a PASSED line genuinely increments InventoryItem.quantityOnHand.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { ProductService } from '@modules/products';
import { InventoryService } from '@modules/inventory';
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

function buildServices() {
  const eventBus = new RedisStreamsEventBus();
  const ruleRepository = new RuleRepository(db);
  const ruleActionExecutor = new RuleActionExecutor({
    eventBus,
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
  });
  const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
    new LegacyApprovalRuleSource(db),
    new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
  ]);

  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];
  const audit = {
    record: async (entry: { eventType: string; entityId: string | null }) => {
      auditEntries.push(entry);
    },
  };

  const productService = new ProductService(db, approvalEvaluator, eventBus, audit);
  const inventoryService = new InventoryService(db, eventBus, audit);

  const products: ProductLookupPort = { getById: (id) => productService.getById(id) };

  const supplierService = new SupplierService(db, audit);
  const requisitionService = new RequisitionService(db, approvalEvaluator, audit, products);

  const requisitionLookup: RequisitionLookupPort = {
    getForPurchaseOrderCreation: (id) => requisitionService.getForPurchaseOrderCreation(id),
    markConverted: (id, actorUserId) => requisitionService.markConverted(id, actorUserId),
  };
  const purchaseOrderService = new PurchaseOrderService(
    db,
    approvalEvaluator,
    eventBus,
    audit,
    supplierService,
    products,
    requisitionLookup,
  );

  const warehouseLookup: WarehouseLookupPort = {
    getWarehouseById: (id) => inventoryService.getWarehouseById(id),
  };
  const inventoryReceipt: InventoryReceiptPort = {
    recordReceipt: (input) => inventoryService.recordReceipt(input),
  };
  const goodsReceiptService = new GoodsReceiptService(
    db,
    eventBus,
    audit,
    warehouseLookup,
    inventoryReceipt,
    purchaseOrderService,
  );

  return {
    productService,
    inventoryService,
    supplierService,
    requisitionService,
    purchaseOrderService,
    goodsReceiptService,
    auditEntries,
  };
}

type Services = ReturnType<typeof buildServices>;

describe('Procurement: requisition -> PO -> goods receipt (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let services: Services;
  let productId: string;
  let warehouseId: string;
  let supplierId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-PROC-${Date.now()}`,
          legalName: 'Procurement Lifecycle Test Co',
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
          firstName: 'Proc',
          lastName: 'Tester',
          email: `proc-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    services = buildServices();

    const product = await asCompany(companyId, userId, () =>
      services.productService.create(
        { companyId, sku: `SKU-PROC-${Date.now()}`, name: 'Base Oil 220N', baseUom: 'MT' },
        userId,
      ),
    );
    productId = product.id;

    const warehouse = await asCompany(companyId, userId, () =>
      services.inventoryService.createWarehouse(
        companyId,
        { code: 'WH-PROC', name: 'Procurement Warehouse', isDefault: true },
        userId,
      ),
    );
    warehouseId = warehouse.id;

    const supplier = await asCompany(companyId, userId, () =>
      services.supplierService.create(
        {
          companyId,
          supplierCode: `SUP-${Date.now()}`,
          legalName: 'Test Petrochemical Supplier',
          country: 'US',
          currency: 'USD',
        },
        userId,
      ),
    );
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.goodsReceiptItem.deleteMany({ where: { goodsReceipt: { companyId } } });
      await rawDb.goodsReceipt.deleteMany({ where: { companyId } });
      await rawDb.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { companyId } } });
      await rawDb.purchaseOrder.deleteMany({ where: { companyId } });
      await rawDb.purchaseRequisitionItem.deleteMany({ where: { requisition: { companyId } } });
      await rawDb.purchaseRequisition.deleteMany({ where: { companyId } });
      await rawDb.approvalRequest.deleteMany({ where: { companyId } });
      await rawDb.supplierContact.deleteMany({ where: { supplier: { companyId } } });
      await rawDb.supplier.deleteMany({ where: { companyId } });
      await rawDb.inventoryMovement.deleteMany({ where: { companyId } });
      await rawDb.inventoryBatch.deleteMany({ where: { inventoryItem: { companyId } } });
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.ruleExecution.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  let requisitionId: string;

  it('creates a requisition and auto-approves it (no matching approval rule)', async () => {
    const requisition = await asCompany(companyId, userId, () =>
      services.requisitionService.create(
        {
          companyId,
          requisitionNumber: `REQ-${Date.now()}`,
          requestedByUserId: userId,
          lineItems: [{ productId, quantity: 500, uom: 'MT', estimatedUnitPrice: 400 }],
        },
        userId,
      ),
    );
    requisitionId = requisition.id;
    expect(requisition.status).toBe('DRAFT');
    expect(services.auditEntries.some((e) => e.eventType === 'REQUISITION_CREATED')).toBe(true);

    const approvals = await asCompany(companyId, userId, () =>
      services.requisitionService.submit(requisitionId, userId),
    );
    expect(approvals).toHaveLength(0);

    const approved = await asCompany(companyId, userId, () =>
      services.requisitionService.getById(requisitionId),
    );
    expect(approved.status).toBe('APPROVED');
  });

  let purchaseOrderId: string;
  let purchaseOrderItemId: string;

  it('creates a purchase order from the approved requisition, marking it CONVERTED', async () => {
    const po = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.createFromRequisition(
        companyId,
        `PO-${Date.now()}`,
        requisitionId,
        supplierId,
        'USD',
        userId,
      ),
    );
    purchaseOrderId = po.id;
    purchaseOrderItemId = po.lineItems[0]!.id;
    expect(po.status).toBe('DRAFT');
    expect(Number(po.totalAmount)).toBe(500 * 400);

    const requisition = await asCompany(companyId, userId, () =>
      services.requisitionService.getById(requisitionId),
    );
    expect(requisition.status).toBe('CONVERTED');

    await expect(
      asCompany(companyId, userId, () =>
        services.purchaseOrderService.createFromRequisition(
          companyId,
          `PO-DUP-${Date.now()}`,
          requisitionId,
          supplierId,
          'USD',
          userId,
        ),
      ),
    ).rejects.toThrow();
  });

  it('sends the PO after auto-approval', async () => {
    const approvals = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.requestApproval(purchaseOrderId, userId),
    );
    expect(approvals).toHaveLength(0);

    const approved = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.getById(purchaseOrderId),
    );
    expect(approved.status).toBe('APPROVED');

    const sent = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.send(purchaseOrderId, userId),
    );
    expect(sent.status).toBe('SENT');
  });

  it('records a partial goods receipt, incrementing InventoryItem.quantityOnHand for PASSED lines only', async () => {
    await asCompany(companyId, userId, () =>
      services.goodsReceiptService.create(
        companyId,
        {
          receiptNumber: `GR-${Date.now()}`,
          purchaseOrderId,
          warehouseId,
          lineItems: [
            {
              purchaseOrderItemId,
              quantityReceived: 200,
              inspectionResult: 'PASSED',
              batchNumber: 'B-1',
            },
          ],
        },
        userId,
      ),
    );

    const item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(200);

    const po = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.getById(purchaseOrderId),
    );
    expect(po.status).toBe('PARTIALLY_RECEIVED');
  });

  it('rejects a FAILED-inspection line from ever touching inventory, then completes the PO on final receipt', async () => {
    await asCompany(companyId, userId, () =>
      services.goodsReceiptService.create(
        companyId,
        {
          receiptNumber: `GR-FAILED-${Date.now()}`,
          purchaseOrderId,
          warehouseId,
          lineItems: [{ purchaseOrderItemId, quantityReceived: 100, inspectionResult: 'FAILED' }],
        },
        userId,
      ),
    );

    let item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(200); // unchanged — FAILED line never fed inventory

    let po = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.getById(purchaseOrderId),
    );
    expect(po.status).toBe('PARTIALLY_RECEIVED'); // receivedQuantity only counts PASSED-side tracking? see below

    await asCompany(companyId, userId, () =>
      services.goodsReceiptService.create(
        companyId,
        {
          receiptNumber: `GR-FINAL-${Date.now()}`,
          purchaseOrderId,
          warehouseId,
          lineItems: [
            {
              purchaseOrderItemId,
              quantityReceived: 300,
              inspectionResult: 'PASSED',
              batchNumber: 'B-2',
            },
          ],
        },
        userId,
      ),
    );

    item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(500);

    po = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.getById(purchaseOrderId),
    );
    expect(po.status).toBe('RECEIVED');

    const closed = await asCompany(companyId, userId, () =>
      services.purchaseOrderService.close(purchaseOrderId, userId),
    );
    expect(closed.status).toBe('CLOSED');
  });
}, 30000);
