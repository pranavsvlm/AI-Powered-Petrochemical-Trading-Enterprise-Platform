/**
 * Chart of accounts, manual journal posting, and the trial-balance/P&L reports (doc 14)
 * against real Postgres — see docs/DOMAIN_MODEL_PHASE5.md. Also exercises
 * SupplierBillService.generateForPurchaseOrder (AP), which posts its own balanced journal.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  ChartOfAccountsService,
  JournalService,
  SupplierBillService,
  ReportsService,
  type PurchaseOrderLookupPort,
} from '@modules/accounting';

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

describe('Accounting: chart of accounts, journals, trial balance & P&L (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let chartOfAccountsService: ChartOfAccountsService;
  let journalService: JournalService;
  let reportsService: ReportsService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-ACCT-${Date.now()}`,
          legalName: 'Accounting Lifecycle Test Co',
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
          firstName: 'Acct',
          lastName: 'Tester',
          email: `acct-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    auditEntries = [];
    const audit = {
      record: async (entry: { eventType: string; entityId: string | null }) => {
        auditEntries.push(entry);
      },
    };
    const eventBus = new RedisStreamsEventBus();

    chartOfAccountsService = new ChartOfAccountsService(db, audit);
    journalService = new JournalService(db, eventBus, audit);
    reportsService = new ReportsService(db);
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.payment.deleteMany({ where: { companyId } });
      await rawDb.supplierBill.deleteMany({ where: { companyId } });
      await rawDb.journalLine.deleteMany({ where: { journal: { companyId } } });
      await rawDb.journal.deleteMany({ where: { companyId } });
      await rawDb.purchaseOrder.deleteMany({ where: { companyId } });
      await rawDb.supplier.deleteMany({ where: { companyId } });
      await rawDb.chartOfAccount.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  it('seeds the default chart of accounts idempotently', async () => {
    const created = await asCompany(companyId, userId, () =>
      chartOfAccountsService.seedDefaultChart(companyId, userId),
    );
    expect(created.length).toBe(7);

    const createdAgain = await asCompany(companyId, userId, () =>
      chartOfAccountsService.seedDefaultChart(companyId, userId),
    );
    expect(createdAgain).toHaveLength(0);

    const accounts = await asCompany(companyId, userId, () =>
      chartOfAccountsService.list(companyId),
    );
    expect(accounts).toHaveLength(7);
  });

  it('rejects posting an unbalanced journal', async () => {
    const cash = await asCompany(companyId, userId, () =>
      chartOfAccountsService.findByCode(companyId, '1000'),
    );
    const revenue = await asCompany(companyId, userId, () =>
      chartOfAccountsService.findByCode(companyId, '4000'),
    );

    await expect(
      asCompany(companyId, userId, () =>
        journalService.post(
          {
            companyId,
            journalNumber: `JRN-BAD-${Date.now()}`,
            journalDate: new Date(),
            sourceType: 'Manual',
            lines: [
              { accountId: cash!.id, debit: 100, credit: 0 },
              { accountId: revenue!.id, debit: 0, credit: 90 },
            ],
          },
          userId,
        ),
      ),
    ).rejects.toThrow('not balanced');
  });

  it('posts a balanced manual journal and reflects it in the trial balance', async () => {
    const cash = await asCompany(companyId, userId, () =>
      chartOfAccountsService.findByCode(companyId, '1000'),
    );
    const equity = await asCompany(companyId, userId, () =>
      chartOfAccountsService.findByCode(companyId, '3000'),
    );

    await asCompany(companyId, userId, () =>
      journalService.post(
        {
          companyId,
          journalNumber: `JRN-CAPITAL-${Date.now()}`,
          journalDate: new Date(),
          memo: 'Owner capital injection',
          sourceType: 'Manual',
          lines: [
            { accountId: cash!.id, debit: 10000, credit: 0 },
            { accountId: equity!.id, debit: 0, credit: 10000 },
          ],
        },
        userId,
      ),
    );
    expect(auditEntries.some((e) => e.eventType === 'JOURNAL_POSTED')).toBe(true);

    const trialBalance = await asCompany(companyId, userId, () =>
      reportsService.trialBalance(companyId),
    );
    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.totalDebits).toBe(10000);
    const cashRow = trialBalance.rows.find((r) => r.accountCode === '1000');
    expect(cashRow!.balance).toBe(10000);
    const equityRow = trialBalance.rows.find((r) => r.accountCode === '3000');
    expect(equityRow!.balance).toBe(10000);
  });

  it('generates a supplier bill from a purchase order, posting a balanced Inventory/AP journal', async () => {
    // SupplierBill has real FKs to purchase_orders/suppliers, so this needs genuine rows —
    // created directly since procurement's own lifecycle is exercised in
    // procurement-requisition-po-receipt.e2e-spec.ts, not the focus here.
    const supplier = await withoutTenant(() =>
      rawDb.supplier.create({
        data: {
          companyId,
          supplierCode: `SUP-ACCT-${Date.now()}`,
          legalName: 'AP Test Supplier',
          country: 'US',
          currency: 'USD',
        },
      }),
    );
    const purchaseOrder = await withoutTenant(() =>
      rawDb.purchaseOrder.create({
        data: {
          companyId,
          poNumber: `PO-ACCT-${Date.now()}`,
          supplierId: supplier.id,
          currency: 'USD',
          createdByUserId: userId,
          subtotal: 5000,
          totalAmount: 5000,
        },
      }),
    );

    const purchaseOrders: PurchaseOrderLookupPort = {
      getById: async () => ({
        id: purchaseOrder.id,
        companyId,
        poNumber: purchaseOrder.poNumber,
        supplierId: supplier.id,
        currency: 'USD',
        totalAmount: 5000,
      }),
    };
    const eventBus = new RedisStreamsEventBus();
    const audit = { record: async () => {} };
    const supplierBillService = new SupplierBillService(db, eventBus, audit, purchaseOrders);

    const bill = await asCompany(companyId, userId, () =>
      supplierBillService.generateForPurchaseOrder(companyId, purchaseOrder.id, userId),
    );
    expect(bill.billNumber).toBe(`BILL-${purchaseOrder.poNumber}`);
    expect(Number(bill.totalAmount)).toBe(5000);
    expect(bill.status).toBe('ISSUED');

    const trialBalance = await asCompany(companyId, userId, () =>
      reportsService.trialBalance(companyId),
    );
    const inventoryRow = trialBalance.rows.find((r) => r.accountCode === '1200');
    const apRow = trialBalance.rows.find((r) => r.accountCode === '2000');
    expect(inventoryRow!.balance).toBe(5000);
    expect(apRow!.balance).toBe(5000);
    expect(trialBalance.isBalanced).toBe(true);
  });

  it('rejects generating a supplier bill when the chart of accounts is not seeded', async () => {
    const unseededCompany = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-ACCT-UNSEEDED-${Date.now()}`,
          legalName: 'Unseeded Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const unseededUser = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: unseededCompany.id,
          firstName: 'U',
          lastName: 'Ser',
          email: `unseeded-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );

    const purchaseOrders: PurchaseOrderLookupPort = {
      getById: async () => ({
        id: 'po-fake-2',
        companyId: unseededCompany.id,
        poNumber: 'PO-FAKE-2',
        supplierId: 'supplier-fake-2',
        currency: 'USD',
        totalAmount: 1000,
      }),
    };
    const eventBus = new RedisStreamsEventBus();
    const audit = { record: async () => {} };
    const supplierBillService = new SupplierBillService(db, eventBus, audit, purchaseOrders);

    await expect(
      asCompany(unseededCompany.id, unseededUser.id, () =>
        supplierBillService.generateForPurchaseOrder(
          unseededCompany.id,
          'po-fake-2',
          unseededUser.id,
        ),
      ),
    ).rejects.toThrow('Chart of accounts is not seeded');

    await withoutTenant(async () => {
      await rawDb.user.deleteMany({ where: { companyId: unseededCompany.id } });
      await rawDb.company.delete({ where: { id: unseededCompany.id } });
    });
  });
}, 30000);
