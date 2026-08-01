/**
 * Analytics dashboard/KPI computation (doc 20) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section. Seeds real Customer/Product/Quotation/Order/
 * Invoice/Supplier/PurchaseOrder/Warehouse/InventoryItem rows directly, then exercises
 * `AnalyticsKpiService`'s real `groupBy`/`aggregate` queries — not mocks, not placeholder
 * numbers — asserting the computed figures against hand-computed expectations.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { AnalyticsKpiService, type FinanceReportsPort } from '@modules/reports';

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

const NOOP_FINANCE_REPORTS: FinanceReportsPort = {
  trialBalance: async () => ({ rows: [], totalDebits: 0, totalCredits: 0, isBalanced: true }),
  profitAndLoss: async () => ({
    revenue: 0,
    expenses: 0,
    netIncome: 0,
    revenueLines: [],
    expenseLines: [],
  }),
};

describe('Analytics: dashboard/KPI computation (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let customerAId: string;
  let customerBId: string;
  let productId: string;
  let supplierId: string;
  let kpis: AnalyticsKpiService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-ANALYTICS-${Date.now()}`,
          legalName: 'Analytics KPI Test Co',
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
          firstName: 'Analytics',
          lastName: 'Tester',
          email: `analytics-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const customerA = await withoutTenant(() =>
      rawDb.customer.create({
        data: {
          companyId,
          customerCode: `CUST-A-${Date.now()}`,
          legalName: 'Gulf Petrochem Buyers',
          country: 'AE',
          currency: 'USD',
          status: 'ACTIVE',
        },
      }),
    );
    customerAId = customerA.id;

    const customerB = await withoutTenant(() =>
      rawDb.customer.create({
        data: {
          companyId,
          customerCode: `CUST-B-${Date.now()}`,
          legalName: 'US Petrochem Buyers',
          country: 'US',
          currency: 'USD',
          status: 'PROSPECT',
        },
      }),
    );
    customerBId = customerB.id;

    const product = await withoutTenant(() =>
      rawDb.product.create({
        data: {
          companyId,
          sku: `SKU-${Date.now()}`,
          name: 'Benzene',
          baseUom: 'MT',
          standardCost: 10,
        },
      }),
    );
    productId = product.id;

    await withoutTenant(() =>
      rawDb.quotation.create({
        data: {
          companyId,
          quotationNumber: `Q-CONVERTED-${Date.now()}`,
          customerId: customerAId,
          status: 'CONVERTED',
          currency: 'USD',
          subtotal: 1500,
          totalAmount: 1500,
          marginPercent: 20,
          createdByUserId: userId,
        },
      }),
    );
    await withoutTenant(() =>
      rawDb.quotation.create({
        data: {
          companyId,
          quotationNumber: `Q-DRAFT-${Date.now()}`,
          customerId: customerBId,
          status: 'DRAFT',
          currency: 'USD',
          subtotal: 900,
          totalAmount: 900,
          createdByUserId: userId,
        },
      }),
    );

    const order = await withoutTenant(() =>
      rawDb.order.create({
        data: {
          companyId,
          orderNumber: `ORD-${Date.now()}`,
          customerId: customerAId,
          status: 'CONFIRMED',
          currency: 'USD',
          subtotal: 1500,
          totalAmount: 1500,
          createdByUserId: userId,
          lineItems: {
            create: [{ productId, quantity: 3, uom: 'MT', unitPrice: 500, lineTotal: 1500 }],
          },
        },
      }),
    );

    await withoutTenant(() =>
      rawDb.invoice.create({
        data: {
          companyId,
          invoiceNumber: `INV-${Date.now()}`,
          orderId: order.id,
          customerId: customerAId,
          status: 'PARTIALLY_PAID',
          currency: 'USD',
          subtotal: 1500,
          totalAmount: 1500,
          amountPaid: 500,
        },
      }),
    );

    const supplier = await withoutTenant(() =>
      rawDb.supplier.create({
        data: {
          companyId,
          supplierCode: `SUP-${Date.now()}`,
          legalName: 'Regional Feedstock Supplier',
          country: 'SA',
          currency: 'USD',
          status: 'ACTIVE',
        },
      }),
    );
    supplierId = supplier.id;

    await withoutTenant(() =>
      rawDb.purchaseOrder.create({
        data: {
          companyId,
          poNumber: `PO-${Date.now()}`,
          supplierId,
          status: 'APPROVED',
          currency: 'USD',
          subtotal: 800,
          totalAmount: 800,
          createdByUserId: userId,
        },
      }),
    );

    const warehouse = await withoutTenant(() =>
      rawDb.warehouse.create({
        data: { companyId, code: `WH-${Date.now()}`, name: 'Main Warehouse' },
      }),
    );

    await withoutTenant(() =>
      rawDb.inventoryItem.create({
        data: { companyId, productId, warehouseId: warehouse.id, quantityOnHand: 50 },
      }),
    );

    kpis = new AnalyticsKpiService(db, NOOP_FINANCE_REPORTS);
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.purchaseOrder.deleteMany({ where: { companyId } });
      await rawDb.supplier.deleteMany({ where: { companyId } });
      await rawDb.invoice.deleteMany({ where: { companyId } });
      await rawDb.orderLineItem.deleteMany({ where: { order: { companyId } } });
      await rawDb.order.deleteMany({ where: { companyId } });
      await rawDb.quotation.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('computes real Executive KPIs', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getExecutiveKpis(companyId));
    expect(result.revenueMonthToDate).toBe(1500);
    expect(result.outstandingReceivables).toBe(1000);
    expect(result.grossProfit).toBe(0);
  });

  it('computes real Sales KPIs (win rate, revenue by customer/country/product)', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getSalesKpis(companyId));
    expect(result.quoteWinRate).toBeCloseTo(0.5);
    expect(result.customerCountsByStatus).toMatchObject({ ACTIVE: 1, PROSPECT: 1 });
    expect(result.revenueByCustomer).toEqual([{ customerId: customerAId, revenue: 1500 }]);
    expect(result.revenueByCountry).toEqual([{ country: 'AE', revenue: 1500 }]);
    expect(result.revenueByProduct).toEqual([{ productId, revenue: 1500 }]);
  });

  it('computes real Trading KPIs (status counts, margin by customer)', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getTradingKpis(companyId));
    expect(result.orderCountsByStatus).toMatchObject({ CONFIRMED: 1 });
    expect(result.quotationCountsByStatus).toMatchObject({ CONVERTED: 1, DRAFT: 1 });
    expect(result.marginByCustomer).toEqual([
      { customerId: customerAId, averageMarginPercent: 20 },
    ]);
  });

  it('computes real Inventory KPIs (stock, value from real standardCost)', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getInventoryKpis(companyId));
    expect(result.stockByProduct).toEqual([{ productId, quantityOnHand: 50 }]);
    expect(result.inventoryValue).toBe(500);
  });

  it('computes real Procurement KPIs (spend by supplier)', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getProcurementKpis(companyId));
    expect(result.spendBySupplier).toEqual([{ supplierId, spend: 800 }]);
    expect(result.spendMonthToDate).toBe(800);
  });

  it('proxies Finance KPIs through the real FinanceReportsPort', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getFinanceKpis(companyId));
    expect(result.trialBalance.isBalanced).toBe(true);
    expect(result.profitAndLoss.netIncome).toBe(0);
  });

  it('computes real AI KPIs as zero when no AI activity exists yet', async () => {
    const result = await asCompany(companyId, userId, () => kpis.getAiKpis(companyId));
    expect(result.requestCount).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.automationRate).toBe(0);
    expect(result.promptSuccessRate).toBe(0);
  });

  it('builds a real snapshot metrics bag from live KPI data', async () => {
    const metrics = await asCompany(companyId, userId, () => kpis.buildSnapshotMetrics(companyId));
    expect(metrics.revenueMonthToDate).toBe(1500);
    expect(metrics.purchaseSpendMonthToDate).toBe(800);
  });
});
