/**
 * Customer and Product catalog lifecycle (docs 11/12) against real Postgres + Redis — see
 * docs/DOMAIN_MODEL_PHASE4.md. Exercises the actual composed CustomerService/ProductService
 * (same wiring as apps/backend/src/modules/{customers,products}/*.module.ts), not mocks, per
 * the project's standing practice (docs/DOMAIN_MODEL_PHASE3.md's postmortem: mocked-only tests
 * hid real bugs that only surfaced under live infra).
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
  RuleRepository,
} from '@platform/rules-engine';
import { CustomerService, type CustomerAuditReader } from '@modules/customers';
import { ProductService } from '@modules/products';

const db = getPrismaClient();
const rawDb = new PrismaClient();

// See the identical comment in document-lifecycle.e2e-spec.ts / tenant-extension.ts: `fn` must
// be awaited *inside* the bound callback, never passed as a bare reference.
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

function buildApprovalEvaluator(eventBus: RedisStreamsEventBus) {
  const ruleRepository = new RuleRepository(db);
  const ruleActionExecutor = new RuleActionExecutor({
    eventBus,
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
  });
  return new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
    new LegacyApprovalRuleSource(db),
    new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
  ]);
}

describe('Customer & Product catalog (live Postgres + Redis)', () => {
  let companyId: string;
  let userId: string;
  let customerService: CustomerService;
  let productService: ProductService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-CATALOG-${Date.now()}`,
          legalName: 'Catalog Lifecycle Test Co',
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
          firstName: 'Catalog',
          lastName: 'Tester',
          email: `catalog-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const eventBus = new RedisStreamsEventBus();
    const approvalEvaluator = buildApprovalEvaluator(eventBus);

    auditEntries = [];
    // Writes for real (unlike a pure in-memory fake) — CustomerService.getTimeline reads back
    // from the actual AuditLog table via CustomerAuditReader, so the writer must round-trip
    // through Postgres for that test to mean anything, mirroring the real AuditService.record.
    const audit = {
      record: async (entry: {
        companyId: string | null;
        actorUserId: string | null;
        eventType: string;
        entityType: string;
        entityId: string | null;
        before?: unknown;
        after?: unknown;
        ipAddress?: string | null;
      }) => {
        auditEntries.push(entry);
        await rawDb.auditLog.create({
          data: {
            companyId: entry.companyId,
            actorUserId: entry.actorUserId,
            eventType: entry.eventType,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before === undefined ? undefined : (entry.before as object),
            after: entry.after === undefined ? undefined : (entry.after as object),
            ipAddress: entry.ipAddress ?? null,
          },
        });
      },
    };
    const auditReader: CustomerAuditReader = {
      listForEntity: (cId, entityType, entityId) =>
        rawDb.auditLog.findMany({
          where: { companyId: cId, entityType, entityId },
          orderBy: { createdAt: 'desc' },
        }),
    };

    customerService = new CustomerService(db, approvalEvaluator, eventBus, audit, auditReader);
    productService = new ProductService(db, approvalEvaluator, eventBus, audit);
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.priceList.deleteMany({ where: { companyId } });
      await rawDb.productPackaging.deleteMany({ where: { product: { companyId } } });
      await rawDb.productAttributeValue.deleteMany({ where: { product: { companyId } } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.productAttribute.deleteMany({ where: { companyId } });
      await rawDb.category.deleteMany({ where: { companyId } });
      await rawDb.customerActivity.deleteMany({ where: { customer: { companyId } } });
      await rawDb.contact.deleteMany({ where: { customer: { companyId } } });
      await rawDb.approvalRequest.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  let customerId: string;

  it('creates a customer and records CUSTOMER_CREATED', async () => {
    const customer = await asCompany(companyId, userId, () =>
      customerService.create(
        {
          companyId,
          customerCode: `CUST-${Date.now()}`,
          legalName: 'Acme Petrochemical Trading',
          country: 'US',
          currency: 'USD',
          customerType: 'DISTRIBUTOR',
          creditLimit: 50000,
          paymentTermsDays: 30,
        },
        userId,
      ),
    );
    customerId = customer.id;
    expect(customer.status).toBe('PROSPECT');
    expect(auditEntries.some((e) => e.eventType === 'CUSTOMER_CREATED')).toBe(true);
  });

  it('adds a contact and lists it', async () => {
    const contact = await asCompany(companyId, userId, () =>
      customerService.addContact(
        customerId,
        { firstName: 'Jane', lastName: 'Buyer', email: 'jane@acme.test', isPrimary: true },
        userId,
      ),
    );
    expect(auditEntries.some((e) => e.eventType === 'CONTACT_ADDED')).toBe(true);

    const contacts = await asCompany(companyId, userId, () =>
      customerService.listContacts(customerId),
    );
    expect(contacts.some((c) => c.id === contact.id)).toBe(true);
  });

  it('promotes a customer through the lifecycle and reflects it in the audit-log-backed timeline', async () => {
    await asCompany(companyId, userId, () =>
      customerService.transitionStatus(customerId, 'QUALIFIED_LEAD', userId),
    );
    await asCompany(companyId, userId, () =>
      customerService.transitionStatus(customerId, 'ACTIVE', userId),
    );

    const customer = await asCompany(companyId, userId, () => customerService.getById(customerId));
    expect(customer.status).toBe('ACTIVE');

    const timeline = await asCompany(companyId, userId, () =>
      customerService.getTimeline(customerId),
    );
    expect(timeline.some((e) => e.eventType === 'CUSTOMER_CREATED')).toBe(true);
    expect(timeline.some((e) => e.eventType === 'CONTACT_ADDED')).toBe(true);
  });

  it('rejects an invalid customer status transition', async () => {
    await expect(
      asCompany(companyId, userId, () =>
        customerService.transitionStatus(customerId, 'PROSPECT', userId),
      ),
    ).rejects.toThrow();
  });

  let productId: string;
  let categoryId: string;
  let densityAttributeId: string;

  it('creates a category and a product under it', async () => {
    const category = await asCompany(companyId, userId, () =>
      productService.createCategory(companyId, 'Base Oils'),
    );
    categoryId = category.id;

    const product = await asCompany(companyId, userId, () =>
      productService.create(
        {
          companyId,
          sku: `SKU-${Date.now()}`,
          name: 'Group I Base Oil 150N',
          categoryId,
          casNumber: '64742-52-5',
          baseUom: 'MT',
          standardCost: 400,
        },
        userId,
      ),
    );
    productId = product.id;
    expect(product.status).toBe('DRAFT');
    expect(auditEntries.some((e) => e.eventType === 'PRODUCT_CREATED')).toBe(true);
  });

  it('records a numeric dynamic attribute (EAV) with a queryable value', async () => {
    const attribute = await asCompany(companyId, userId, () =>
      productService.createAttribute(companyId, 'Density', 'NUMBER', 'g/cm3'),
    );
    densityAttributeId = attribute.id;

    await asCompany(companyId, userId, () =>
      productService.setAttributeValue(productId, densityAttributeId, '0.865'),
    );

    const values = await asCompany(companyId, userId, () =>
      productService.listAttributeValues(productId),
    );
    const densityValue = values.find((v) => v.attributeId === densityAttributeId);
    expect(densityValue?.value).toBe('0.865');
    expect(Number(densityValue?.valueNumber)).toBeCloseTo(0.865);
  });

  it('rejects a non-numeric value for a NUMBER attribute', async () => {
    await expect(
      asCompany(companyId, userId, () =>
        productService.setAttributeValue(productId, densityAttributeId, 'not-a-number'),
      ),
    ).rejects.toThrow();
  });

  it('adds a packaging option', async () => {
    await asCompany(companyId, userId, () =>
      productService.addPackaging(productId, 'DRUM', 200, 'LITER'),
    );
    const packaging = await asCompany(companyId, userId, () =>
      productService.listPackaging(productId),
    );
    expect(packaging.some((p) => p.packagingType === 'DRUM')).toBe(true);
  });

  it('resolves the most specific price list entry via getEffectivePrice', async () => {
    await asCompany(companyId, userId, () =>
      productService.upsertPriceListEntry(
        { companyId, productId, currency: 'USD', uom: 'MT', minQuantity: 0, unitPrice: 500 },
        userId,
      ),
    );
    await asCompany(companyId, userId, () =>
      productService.upsertPriceListEntry(
        {
          companyId,
          productId,
          customerId,
          currency: 'USD',
          uom: 'MT',
          minQuantity: 0,
          unitPrice: 450,
        },
        userId,
      ),
    );

    const generalPrice = await asCompany(companyId, userId, () =>
      productService.getEffectivePrice(companyId, productId, { quantity: 1, currency: 'USD' }),
    );
    expect(generalPrice.unitPrice).toBe(500);

    const customerPrice = await asCompany(companyId, userId, () =>
      productService.getEffectivePrice(companyId, productId, {
        customerId,
        quantity: 1,
        currency: 'USD',
      }),
    );
    expect(customerPrice.unitPrice).toBe(450);
    expect(customerPrice.marginPercent).toBeCloseTo(((450 - 400) / 450) * 100);
  });

  it('auto-activates a product when no approval rule matches, and archives on request', async () => {
    const approvals = await asCompany(companyId, userId, () =>
      productService.requestApproval(productId, userId),
    );
    expect(approvals).toHaveLength(0);

    const afterRequest = await asCompany(companyId, userId, () =>
      productService.getById(productId),
    );
    expect(afterRequest.status).toBe('ACTIVE');

    await asCompany(companyId, userId, () => productService.archive(productId, userId));
    const archived = await asCompany(companyId, userId, () => productService.getById(productId));
    expect(archived.status).toBe('ARCHIVED');
  });
}, 30000);

describe('Customer & Product catalog tenant isolation', () => {
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;
  let customerService: CustomerService;
  let productService: ProductService;

  beforeAll(async () => {
    const companyA = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-CAT-A-${Date.now()}`,
          legalName: 'Catalog Tenant A',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const companyB = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-CAT-B-${Date.now()}`,
          legalName: 'Catalog Tenant B',
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
          email: `cat-a-${Date.now()}@test.local`,
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
          email: `cat-b-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userAId = userA.id;
    userBId = userB.id;

    const eventBus = new RedisStreamsEventBus();
    const approvalEvaluator = buildApprovalEvaluator(eventBus);
    const audit = { record: async () => {} };
    const auditReader: CustomerAuditReader = { listForEntity: async () => [] };
    customerService = new CustomerService(db, approvalEvaluator, eventBus, audit, auditReader);
    productService = new ProductService(db, approvalEvaluator, eventBus, audit);
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.product.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.customer.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    });
  });

  it("Company B cannot read Company A's customer by id", async () => {
    const customerA = await asCompany(companyAId, userAId, () =>
      customerService.create(
        {
          companyId: companyAId,
          customerCode: 'A-SECRET',
          legalName: 'Company A Secret Customer',
          country: 'US',
          currency: 'USD',
        },
        userAId,
      ),
    );

    await expect(
      asCompany(companyBId, userBId, () => customerService.getById(customerA.id)),
    ).rejects.toThrow();
  });

  it("Company B's product list never surfaces Company A's products", async () => {
    await asCompany(companyAId, userAId, () =>
      productService.create(
        { companyId: companyAId, sku: 'A-SKU', name: 'Company A Product', baseUom: 'MT' },
        userAId,
      ),
    );

    const listB = await asCompany(companyBId, userBId, () =>
      productService.list({ companyId: companyBId }),
    );
    expect(listB.some((p) => p.name === 'Company A Product')).toBe(false);
  });
}, 30000);
