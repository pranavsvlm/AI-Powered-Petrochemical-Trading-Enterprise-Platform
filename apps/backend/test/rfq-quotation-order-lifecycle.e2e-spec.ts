/**
 * Full RFQ -> Quotation -> Order journey (doc 13) against real Postgres + Redis — see
 * docs/DOMAIN_MODEL_PHASE4.md. Exercises the actual composed Rfq/Quotation/Order services with
 * the same cross-module wiring as apps/backend/src/modules/{quotations,orders}/*.module.ts
 * (PricingLookupPort -> ProductService, QuotationLookupPort -> QuotationService), not mocks —
 * per the project's standing practice of testing against live infra before calling a phase done.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the services in docker/docker-compose.yml.
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
  RuleManagementService,
  RuleRepository,
} from '@platform/rules-engine';
import { CustomerService, type CustomerAuditReader } from '@modules/customers';
import { ProductService } from '@modules/products';
import { InventoryService } from '@modules/inventory';
import { ChartOfAccountsService, InvoiceService } from '@modules/accounting';
import {
  RfqService,
  QuotationService,
  type PricingLookupPort,
  type CustomerLookupPort,
  type ProductLookupPort,
} from '@modules/quotations';
import {
  OrderService,
  type QuotationLookupPort,
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

interface Services {
  customerService: CustomerService;
  productService: ProductService;
  inventoryService: InventoryService;
  chartOfAccountsService: ChartOfAccountsService;
  rfqService: RfqService;
  quotationService: QuotationService;
  orderService: OrderService;
  auditEntries: Array<{ eventType: string; entityId: string | null }>;
}

function buildServices(): Services {
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
  const invoiceService = new InvoiceService(db, eventBus, audit);
  const chartOfAccountsService = new ChartOfAccountsService(db, audit);

  // Both call the owning service's own tenant-scoped getById — the same wiring
  // apps/backend/src/modules/{quotations,orders}/*.module.ts use in production, and the thing
  // that actually rejects a cross-tenant customerId/productId (see docs/DOMAIN_MODEL_PHASE4.md §11).
  const customerLookup: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
  const productLookup: ProductLookupPort = { getById: (id) => productService.getById(id) };

  const rfqService = new RfqService(db, eventBus, audit, customerLookup, productLookup);

  const pricing: PricingLookupPort = {
    getEffectivePrice: (companyId, productId, query) =>
      productService.getEffectivePrice(companyId, productId, query),
  };
  const quotationService = new QuotationService(
    db,
    approvalEvaluator,
    eventBus,
    audit,
    pricing,
    rfqService,
    customerLookup,
  );

  const quotationLookup: QuotationLookupPort = {
    getForOrderCreation: (quotationId) => quotationService.getForOrderCreation(quotationId),
    markConverted: async (quotationId, actorUserId) => {
      await quotationService.convertToOrder(quotationId, actorUserId);
    },
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
    quotationLookup,
    customerLookup,
    productLookup,
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
    rfqService,
    quotationService,
    orderService,
    auditEntries,
  };
}

describe('RFQ -> Quotation -> Order lifecycle (live Postgres + Redis)', () => {
  let companyId: string;
  let userId: string;
  let services: Services;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-TRADE-${Date.now()}`,
          legalName: 'Trading Lifecycle Test Co',
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
          firstName: 'Trade',
          lastName: 'Tester',
          email: `trade-tester-${Date.now()}@test.local`,
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
          customerCode: `CUST-${Date.now()}`,
          legalName: 'Trading Customer',
          country: 'US',
          currency: 'USD',
        },
        userId,
      ),
    );
    customerId = customer.id;

    const product = await asCompany(companyId, userId, () =>
      services.productService.create(
        {
          companyId,
          sku: `SKU-TRADE-${Date.now()}`,
          name: 'Base Oil 500N',
          baseUom: 'MT',
          standardCost: 400,
        },
        userId,
      ),
    );
    productId = product.id;

    await asCompany(companyId, userId, () =>
      services.productService.upsertPriceListEntry(
        { companyId, productId, currency: 'USD', uom: 'MT', minQuantity: 0, unitPrice: 500 },
        userId,
      ),
    );

    // Phase 5: order creation now atomically reserves stock, so a default warehouse with
    // enough on-hand quantity must exist before createFromQuotation/createDirect can succeed.
    const warehouse = await asCompany(companyId, userId, () =>
      services.inventoryService.createWarehouse(
        companyId,
        { code: 'WH-TRADE', name: 'Trade Test Warehouse', isDefault: true },
        userId,
      ),
    );
    await asCompany(companyId, userId, () =>
      services.inventoryService.recordReceipt({
        companyId,
        productId,
        warehouseId: warehouse.id,
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
      await rawDb.quotationLineItem.deleteMany({
        where: { quotationVersion: { quotation: { companyId } } },
      });
      await rawDb.quotationVersion.deleteMany({ where: { quotation: { companyId } } });
      await rawDb.quotation.deleteMany({ where: { companyId } });
      await rawDb.rfqLineItem.deleteMany({ where: { rfq: { companyId } } });
      await rawDb.rfq.deleteMany({ where: { companyId } });
      await rawDb.approvalRequest.deleteMany({ where: { companyId } });
      await rawDb.priceList.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.ruleExecution.deleteMany({ where: { companyId } });
      await rawDb.ruleAction.deleteMany({ where: { ruleVersion: { rule: { companyId } } } });
      await rawDb.ruleCondition.deleteMany({ where: { ruleVersion: { rule: { companyId } } } });
      await rawDb.ruleVersion.deleteMany({ where: { rule: { companyId } } });
      await rawDb.rule.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  let rfqId: string;

  it('creates an RFQ with a line item and submits it', async () => {
    const rfq = await asCompany(companyId, userId, () =>
      services.rfqService.create({
        companyId,
        rfqNumber: `RFQ-${Date.now()}`,
        customerId,
        currency: 'USD',
        createdByUserId: userId,
        lineItems: [{ productId, quantity: 20, uom: 'MT' }],
      }),
    );
    rfqId = rfq.id;
    expect(rfq.status).toBe('DRAFT');
    expect(services.auditEntries.some((e) => e.eventType === 'RFQ_CREATED')).toBe(true);

    const submitted = await asCompany(companyId, userId, () => services.rfqService.submit(rfqId));
    expect(submitted.status).toBe('SUBMITTED');
  });

  it('rejects submitting an already-submitted RFQ', async () => {
    await expect(
      asCompany(companyId, userId, () => services.rfqService.submit(rfqId)),
    ).rejects.toThrow();
  });

  let quotationId: string;

  it('generates a quotation from the RFQ, resolving price via the products pricing port', async () => {
    const quotation = await asCompany(companyId, userId, () =>
      services.quotationService.createFromRfq(
        companyId,
        { quotationNumber: `QUO-${Date.now()}`, rfqId, lineItems: [{ productId, quantity: 20 }] },
        userId,
      ),
    );
    quotationId = quotation.id;
    expect(Number(quotation.totalAmount)).toBe(20 * 500);
    expect(quotation.status).toBe('DRAFT');
    expect(services.auditEntries.some((e) => e.eventType === 'QUOTATION_GENERATED')).toBe(true);

    const rfq = await asCompany(companyId, userId, () => services.rfqService.getById(rfqId));
    expect(rfq.status).toBe('QUOTED');
  });

  it('moves the quotation through send -> negotiate -> a manual price revision', async () => {
    await asCompany(companyId, userId, () => services.quotationService.send(quotationId, userId));
    await asCompany(companyId, userId, () => services.quotationService.negotiate(quotationId));

    const revised = await asCompany(companyId, userId, () =>
      services.quotationService.reviseVersion(
        quotationId,
        [{ productId, quantity: 20, uom: 'MT', unitPrice: 480 }],
        userId,
      ),
    );
    expect(Number(revised.totalAmount)).toBe(20 * 480);
    expect(revised.currentVersionNumber).toBe(2);
    expect(services.auditEntries.some((e) => e.eventType === 'PRICE_OVERRIDDEN')).toBe(true);
  });

  it('auto-approves the quotation when no approval rule matches', async () => {
    const approvals = await asCompany(companyId, userId, () =>
      services.quotationService.requestApproval(quotationId, userId),
    );
    expect(approvals).toHaveLength(0);

    const quotation = await asCompany(companyId, userId, () =>
      services.quotationService.getById(quotationId),
    );
    expect(quotation.status).toBe('APPROVED');
  });

  let orderId: string;
  let orderLineItemId: string;

  it('converts the approved quotation into a confirmed order, marking the quotation CONVERTED', async () => {
    const order = await asCompany(companyId, userId, () =>
      services.orderService.createFromQuotation(
        companyId,
        `ORD-${Date.now()}`,
        quotationId,
        userId,
      ),
    );
    orderId = order.id;
    orderLineItemId = order.lineItems[0]!.id;
    expect(Number(order.totalAmount)).toBe(20 * 480);
    expect(order.status).toBe('PENDING_CONFIRMATION');

    const quotation = await asCompany(companyId, userId, () =>
      services.quotationService.getById(quotationId),
    );
    expect(quotation.status).toBe('CONVERTED');

    await asCompany(companyId, userId, () => services.orderService.confirm(orderId, userId));
    const confirmed = await asCompany(companyId, userId, () =>
      services.orderService.getById(orderId),
    );
    expect(confirmed.status).toBe('CONFIRMED');
  });

  it('tracks partial then full fulfillment', async () => {
    const partiallyFulfilled = await asCompany(companyId, userId, () =>
      services.orderService.fulfillLine(orderId, orderLineItemId, 10, userId),
    );
    expect(partiallyFulfilled.status).toBe('PARTIALLY_FULFILLED');

    const fulfilled = await asCompany(companyId, userId, () =>
      services.orderService.fulfillLine(orderId, orderLineItemId, 20, userId),
    );
    expect(fulfilled.status).toBe('FULFILLED');
  });

  it('closes the fulfilled order', async () => {
    const closed = await asCompany(companyId, userId, () =>
      services.orderService.close(orderId, userId),
    );
    expect(closed.status).toBe('CLOSED');
  });

  it('resolves a real approval rule via the Rules Engine and waits for a decision on a second quotation', async () => {
    const ruleManagement = new RuleManagementService(db, new RuleRepository(db));
    const rule = await asCompany(companyId, userId, () =>
      ruleManagement.create({
        companyId,
        name: 'quotations-require-approval',
        module: 'quotations',
        priority: 10,
        condition: { '>=': [{ var: 'orderValue' }, 1] } as never,
        actions: [{ type: 'REQUEST_APPROVAL', params: { approverUserId: userId } }],
      }),
    );
    await asCompany(companyId, userId, () => ruleManagement.publish(rule.id));

    const secondRfq = await asCompany(companyId, userId, () =>
      services.rfqService.create({
        companyId,
        rfqNumber: `RFQ-2-${Date.now()}`,
        customerId,
        currency: 'USD',
        createdByUserId: userId,
        lineItems: [{ productId, quantity: 5, uom: 'MT' }],
      }),
    );
    await asCompany(companyId, userId, () => services.rfqService.submit(secondRfq.id));

    const secondQuotation = await asCompany(companyId, userId, () =>
      services.quotationService.createFromRfq(
        companyId,
        {
          quotationNumber: `QUO-2-${Date.now()}`,
          rfqId: secondRfq.id,
          lineItems: [{ productId, quantity: 5 }],
        },
        userId,
      ),
    );
    await asCompany(companyId, userId, () =>
      services.quotationService.send(secondQuotation.id, userId),
    );

    const approvals = await asCompany(companyId, userId, () =>
      services.quotationService.requestApproval(secondQuotation.id, userId),
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);

    const pending = await asCompany(companyId, userId, () =>
      services.quotationService.getById(secondQuotation.id),
    );
    expect(pending.status).toBe('PENDING_APPROVAL');

    const decided = await asCompany(companyId, userId, () =>
      services.quotationService.decideApproval(approvals[0]!.id, 'APPROVED', userId, 'looks good'),
    );
    expect(decided.status).toBe('APPROVED');

    const approved = await asCompany(companyId, userId, () =>
      services.quotationService.getById(secondQuotation.id),
    );
    expect(approved.status).toBe('APPROVED');
  });

  it('reopens straight to NEGOTIATING on rejection, with no separate REJECTED status', async () => {
    const thirdRfq = await asCompany(companyId, userId, () =>
      services.rfqService.create({
        companyId,
        rfqNumber: `RFQ-3-${Date.now()}`,
        customerId,
        currency: 'USD',
        createdByUserId: userId,
        lineItems: [{ productId, quantity: 2, uom: 'MT' }],
      }),
    );
    await asCompany(companyId, userId, () => services.rfqService.submit(thirdRfq.id));
    const thirdQuotation = await asCompany(companyId, userId, () =>
      services.quotationService.createFromRfq(
        companyId,
        {
          quotationNumber: `QUO-3-${Date.now()}`,
          rfqId: thirdRfq.id,
          lineItems: [{ productId, quantity: 2 }],
        },
        userId,
      ),
    );
    await asCompany(companyId, userId, () =>
      services.quotationService.send(thirdQuotation.id, userId),
    );

    const approvals = await asCompany(companyId, userId, () =>
      services.quotationService.requestApproval(thirdQuotation.id, userId),
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);

    const rejected = await asCompany(companyId, userId, () =>
      services.quotationService.decideApproval(
        approvals[0]!.id,
        'REJECTED',
        userId,
        'price too low',
      ),
    );
    expect(rejected.status).toBe('REJECTED');

    const quotation = await asCompany(companyId, userId, () =>
      services.quotationService.getById(thirdQuotation.id),
    );
    expect(quotation.status).toBe('NEGOTIATING');
    expect(services.auditEntries.some((e) => e.eventType === 'QUOTATION_REJECTED')).toBe(true);
  });
}, 30000);

describe('RFQ -> Quotation -> Order tenant isolation', () => {
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;
  let servicesA: Services;
  let servicesB: Services;
  let customerAId: string;
  let productAId: string;

  beforeAll(async () => {
    const companyA = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-TRADE-A-${Date.now()}`,
          legalName: 'Trade Tenant A',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const companyB = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-TRADE-B-${Date.now()}`,
          legalName: 'Trade Tenant B',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyAId = companyA.id;
    companyBId = companyB.id;

    const userA = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyAId,
          firstName: 'A',
          lastName: 'User',
          email: `trade-a-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    const userB = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyBId,
          firstName: 'B',
          lastName: 'User',
          email: `trade-b-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userAId = userA.id;
    userBId = userB.id;

    servicesA = buildServices();
    servicesB = buildServices();

    const customerA = await asCompany(companyAId, userAId, () =>
      servicesA.customerService.create(
        {
          companyId: companyAId,
          customerCode: 'A-CUST',
          legalName: 'Tenant A Customer',
          country: 'US',
          currency: 'USD',
        },
        userAId,
      ),
    );
    customerAId = customerA.id;

    const productA = await asCompany(companyAId, userAId, () =>
      servicesA.productService.create(
        { companyId: companyAId, sku: 'A-SKU-TRADE', name: 'Tenant A Product', baseUom: 'MT' },
        userAId,
      ),
    );
    productAId = productA.id;
    await asCompany(companyAId, userAId, () =>
      servicesA.productService.upsertPriceListEntry(
        {
          companyId: companyAId,
          productId: productAId,
          currency: 'USD',
          uom: 'MT',
          minQuantity: 0,
          unitPrice: 100,
        },
        userAId,
      ),
    );
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.rfqLineItem.deleteMany({
        where: { rfq: { companyId: { in: [companyAId, companyBId] } } },
      });
      await rawDb.rfq.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.priceList.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.product.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.customer.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    });
  });

  it("Company B cannot create an RFQ against Company A's customer", async () => {
    await expect(
      asCompany(companyBId, userBId, () =>
        servicesB.rfqService.create({
          companyId: companyBId,
          rfqNumber: 'CROSS-TENANT-RFQ',
          customerId: customerAId,
          currency: 'USD',
          createdByUserId: userBId,
          lineItems: [{ productId: productAId, quantity: 1, uom: 'MT' }],
        }),
      ),
    ).rejects.toThrow();
  });

  it("Company B's RFQ list never surfaces Company A's RFQs", async () => {
    const rfqA = await asCompany(companyAId, userAId, () =>
      servicesA.rfqService.create({
        companyId: companyAId,
        rfqNumber: 'TENANT-A-RFQ',
        customerId: customerAId,
        currency: 'USD',
        createdByUserId: userAId,
        lineItems: [{ productId: productAId, quantity: 1, uom: 'MT' }],
      }),
    );

    const listB = await asCompany(companyBId, userBId, () =>
      servicesB.rfqService.list({ companyId: companyBId }),
    );
    expect(listB.some((r) => r.id === rfqA.id)).toBe(false);

    await expect(
      asCompany(companyBId, userBId, () => servicesB.rfqService.getById(rfqA.id)),
    ).rejects.toThrow();
  });
}, 30000);
