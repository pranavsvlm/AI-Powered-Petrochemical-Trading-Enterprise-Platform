/**
 * The race-safety bar for Phase 5 (doc 16) — see docs/DOMAIN_MODEL_PHASE5.md. A single
 * InventoryItem with quantityOnHand=100 gets 20 truly concurrent OrderService.createDirect
 * calls, each ordering 10 units. Postgres's row-level UPDATE semantics (the atomic conditional
 * `UPDATE ... WHERE (on_hand - reserved) >= qty` in InventoryRepository.atomicReserve) should
 * serialize the concurrent writers deterministically: exactly 10 succeed, exactly 10 fail with
 * InsufficientStockException — never more, never fewer, and never a double-reservation past
 * capacity. This is the actual "race-safe" acceptance bar, not just a typecheck.
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
import { CustomerService, type CustomerAuditReader } from '@modules/customers';
import { ProductService } from '@modules/products';
import { InventoryService, InsufficientStockException } from '@modules/inventory';
import { InvoiceService } from '@modules/accounting';
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

function buildOrderService() {
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
  const audit = { record: async () => {} };
  const auditReader: CustomerAuditReader = { listForEntity: async () => [] };

  const customerService = new CustomerService(db, approvalEvaluator, eventBus, audit, auditReader);
  const productService = new ProductService(db, approvalEvaluator, eventBus, audit);
  const inventoryService = new InventoryService(db, eventBus, audit);
  const invoiceService = new InvoiceService(db, eventBus, audit);

  const customers: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
  const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
  const quotations: QuotationLookupPort = {
    getForOrderCreation: () => {
      throw new Error('not used in this suite');
    },
    markConverted: async () => {},
  };
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

  const orderService = new OrderService(
    db,
    approvalEvaluator,
    eventBus,
    audit,
    quotations,
    customers,
    products,
    inventoryReserve,
    inventoryRelease,
    inventoryCommit,
    invoicing,
  );

  return { customerService, productService, inventoryService, orderService };
}

describe('Inventory reservation concurrency (live Postgres, real row-lock contention)', () => {
  let companyId: string;
  let userId: string;
  let customerId: string;
  let productId: string;
  let warehouseId: string;
  let services: ReturnType<typeof buildOrderService>;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-CONC-${Date.now()}`,
          legalName: 'Concurrency Test Co',
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
          firstName: 'Conc',
          lastName: 'Tester',
          email: `conc-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    services = buildOrderService();

    const customer = await asCompany(companyId, userId, () =>
      services.customerService.create(
        {
          companyId,
          customerCode: `CUST-CONC-${Date.now()}`,
          legalName: 'Concurrency Customer',
          country: 'US',
          currency: 'USD',
        },
        userId,
      ),
    );
    customerId = customer.id;

    const product = await asCompany(companyId, userId, () =>
      services.productService.create(
        { companyId, sku: `SKU-CONC-${Date.now()}`, name: 'Base Oil 500N', baseUom: 'MT' },
        userId,
      ),
    );
    productId = product.id;

    const warehouse = await asCompany(companyId, userId, () =>
      services.inventoryService.createWarehouse(
        companyId,
        { code: 'WH-CONC', name: 'Concurrency Warehouse', isDefault: true },
        userId,
      ),
    );
    warehouseId = warehouse.id;

    await asCompany(companyId, userId, () =>
      services.inventoryService.recordReceipt({
        companyId,
        productId,
        warehouseId,
        quantity: 100,
        entityType: 'Test',
        entityId: 'seed',
      }),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.stockReservation.deleteMany({ where: { companyId } });
      await rawDb.inventoryMovement.deleteMany({ where: { companyId } });
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.orderLineItem.deleteMany({ where: { order: { companyId } } });
      await rawDb.order.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  it('fires 20 concurrent orders of 10 units each against 100 on-hand: exactly 10 succeed, exactly 10 fail', async () => {
    const attempts = Array.from({ length: 20 }, (_, i) =>
      asCompany(companyId, userId, () =>
        services.orderService.createDirect(
          companyId,
          {
            orderNumber: `ORD-CONC-${i}-${Date.now()}`,
            customerId,
            currency: 'USD',
            warehouseId,
            lineItems: [{ productId, quantity: 10, uom: 'MT', unitPrice: 50 }],
          },
          userId,
        ),
      ),
    );

    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);

    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(InsufficientStockException);
    }

    const item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(100); // untouched — nothing was ever committed/dispatched
    expect(Number(item.quantityReserved)).toBe(100); // exactly fully reserved, never over

    const activeReservations = await withoutTenant(() =>
      rawDb.stockReservation.findMany({ where: { companyId, status: 'ACTIVE' } }),
    );
    const totalReserved = activeReservations.reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(totalReserved).toBe(100);
    expect(activeReservations).toHaveLength(10);

    // Boundary: stock is now fully reserved — even a single additional unit must fail.
    await expect(
      asCompany(companyId, userId, () =>
        services.orderService.createDirect(
          companyId,
          {
            orderNumber: `ORD-CONC-BOUNDARY-${Date.now()}`,
            customerId,
            currency: 'USD',
            warehouseId,
            lineItems: [{ productId, quantity: 1, uom: 'MT', unitPrice: 50 }],
          },
          userId,
        ),
      ),
    ).rejects.toThrow(InsufficientStockException);
  }, 30000);
});
