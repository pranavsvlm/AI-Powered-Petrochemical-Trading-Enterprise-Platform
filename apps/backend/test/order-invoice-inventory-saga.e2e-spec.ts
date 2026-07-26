/**
 * The Order -> Inventory -> Invoice confirmation saga (docs 13/14/16) against real Postgres —
 * see docs/DOMAIN_MODEL_PHASE5.md. Exercises the actual composed OrderService with real
 * InventoryService/InvoiceService ports, the same wiring as
 * apps/backend/src/modules/orders/orders.module.ts, not mocks. The saga's failure/compensation
 * branch is covered deterministically in modules/orders/application/order.service.spec.ts
 * (mocked InvoicingPort) rather than here — this file is the happy path against live infra.
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
import { InventoryService } from '@modules/inventory';
import { ChartOfAccountsService, InvoiceService } from '@modules/accounting';
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
  const auditReader: CustomerAuditReader = { listForEntity: async () => [] };

  const customerService = new CustomerService(db, approvalEvaluator, eventBus, audit, auditReader);
  const productService = new ProductService(db, approvalEvaluator, eventBus, audit);
  const inventoryService = new InventoryService(db, eventBus, audit);
  const chartOfAccountsService = new ChartOfAccountsService(db, audit);
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

  return {
    customerService,
    productService,
    inventoryService,
    chartOfAccountsService,
    invoiceService,
    orderService,
    auditEntries,
  };
}

type Services = ReturnType<typeof buildServices>;

describe('Order confirmation saga: reserve -> commit -> invoice (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let services: Services;
  let customerId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-SAGA-${Date.now()}`,
          legalName: 'Saga Lifecycle Test Co',
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
          firstName: 'Saga',
          lastName: 'Tester',
          email: `saga-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    services = buildServices();

    const customer = await asCompany(companyId, userId, () =>
      services.customerService.create(
        {
          companyId,
          customerCode: `CUST-SAGA-${Date.now()}`,
          legalName: 'Saga Customer',
          country: 'US',
          currency: 'USD',
        },
        userId,
      ),
    );
    customerId = customer.id;

    const product = await asCompany(companyId, userId, () =>
      services.productService.create(
        { companyId, sku: `SKU-SAGA-${Date.now()}`, name: 'Base Oil 500N', baseUom: 'MT' },
        userId,
      ),
    );
    productId = product.id;

    const warehouse = await asCompany(companyId, userId, () =>
      services.inventoryService.createWarehouse(
        companyId,
        { code: 'WH-SAGA', name: 'Saga Warehouse', isDefault: true },
        userId,
      ),
    );
    warehouseId = warehouse.id;

    await asCompany(companyId, userId, () =>
      services.inventoryService.recordReceipt({
        companyId,
        productId,
        warehouseId,
        quantity: 1000,
        entityType: 'Test',
        entityId: 'seed',
      }),
    );

    await asCompany(companyId, userId, () =>
      services.chartOfAccountsService.seedDefaultChart(companyId, userId),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.payment.deleteMany({ where: { companyId } });
      await rawDb.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
      await rawDb.invoice.deleteMany({ where: { companyId } });
      await rawDb.journalLine.deleteMany({ where: { journal: { companyId } } });
      await rawDb.journal.deleteMany({ where: { companyId } });
      await rawDb.chartOfAccount.deleteMany({ where: { companyId } });
      await rawDb.stockReservation.deleteMany({ where: { companyId } });
      await rawDb.inventoryMovement.deleteMany({ where: { companyId } });
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.orderLineItem.deleteMany({ where: { order: { companyId } } });
      await rawDb.order.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  let orderId: string;

  it('creates a direct order, atomically reserving stock in the same transaction', async () => {
    const order = await asCompany(companyId, userId, () =>
      services.orderService.createDirect(
        companyId,
        {
          orderNumber: `ORD-SAGA-${Date.now()}`,
          customerId,
          currency: 'USD',
          warehouseId,
          lineItems: [{ productId, quantity: 100, uom: 'MT', unitPrice: 50 }],
        },
        userId,
      ),
    );
    orderId = order.id;
    expect(order.status).toBe('PENDING_CONFIRMATION');

    const item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(1000);
    expect(Number(item.quantityReserved)).toBe(100);
  });

  it('confirming the order runs the saga: commits inventory and generates a balanced invoice', async () => {
    await asCompany(companyId, userId, () => services.orderService.confirm(orderId, userId));

    const item = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(900); // 1000 - 100, permanently dispatched
    expect(Number(item.quantityReserved)).toBe(0); // reservation converted to COMMITTED

    const movements = await asCompany(companyId, userId, () =>
      services.inventoryService.listMovements(companyId, item.id),
    );
    expect(
      movements.some((m) => m.movementType === 'DISPATCH' && Number(m.quantity) === -100),
    ).toBe(true);

    const invoice = await asCompany(companyId, userId, () =>
      services.invoiceService.getByOrderId(orderId),
    );
    expect(invoice.invoiceNumber).toContain('INV-');
    expect(Number(invoice.totalAmount)).toBe(100 * 50);
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.items).toHaveLength(1);

    const journal = await withoutTenant(() =>
      rawDb.journal.findFirst({
        where: { sourceType: 'Invoice', sourceId: invoice.id },
        include: { lines: true },
      }),
    );
    expect(journal).not.toBeNull();
    const totalDebit = journal!.lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = journal!.lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(100 * 50);
  });

  it('rejects retrying invoice generation twice for the same order (Invoice.orderId is unique)', async () => {
    await expect(
      asCompany(companyId, userId, () =>
        services.orderService.retryInvoiceGeneration(orderId, userId),
      ),
    ).rejects.toThrow();
  });

  it('rejects generating an invoice for an order that was never confirmed', async () => {
    const pendingOrder = await asCompany(companyId, userId, () =>
      services.orderService.createDirect(
        companyId,
        {
          orderNumber: `ORD-SAGA-PENDING-${Date.now()}`,
          customerId,
          currency: 'USD',
          warehouseId,
          lineItems: [{ productId, quantity: 10, uom: 'MT', unitPrice: 50 }],
        },
        userId,
      ),
    );

    await expect(
      asCompany(companyId, userId, () =>
        services.orderService.retryInvoiceGeneration(pendingOrder.id, userId),
      ),
    ).rejects.toThrow('Cannot generate an invoice before the order is confirmed.');
  });

  it('releases the reservation when a PENDING_CONFIRMATION order is cancelled', async () => {
    const order = await asCompany(companyId, userId, () =>
      services.orderService.createDirect(
        companyId,
        {
          orderNumber: `ORD-SAGA-CANCEL-${Date.now()}`,
          customerId,
          currency: 'USD',
          warehouseId,
          lineItems: [{ productId, quantity: 50, uom: 'MT', unitPrice: 50 }],
        },
        userId,
      ),
    );

    const itemBefore = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    const reservedBefore = Number(itemBefore.quantityReserved);

    await asCompany(companyId, userId, () => services.orderService.cancel(order.id, userId));

    const itemAfter = await asCompany(companyId, userId, () =>
      services.inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(itemAfter.quantityReserved)).toBe(reservedBefore - 50);
  });
}, 30000);
