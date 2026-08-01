import { Injectable } from '@nestjs/common';
import type { TenantScopedPrismaClient } from '@platform/database';
import type { TrendPoint } from '../domain/sales-forecast';

/**
 * Narrow port onto Accounting's own real report computation (`ReportsService.trialBalance`/
 * `profitAndLoss`) — never a direct cross-module import, same pattern `modules/quotations`
 * already established for `CustomerLookupPort`/`ProductLookupPort`. Shapes are declared locally
 * (structurally matching Accounting's real return types) rather than imported, per the platform
 * module contract's "no module depends on another module's internals."
 */
export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  name: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface TrialBalanceSummary {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export interface ProfitAndLossLine {
  accountId: string;
  accountCode: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossSummary {
  revenue: number;
  expenses: number;
  netIncome: number;
  revenueLines: ProfitAndLossLine[];
  expenseLines: ProfitAndLossLine[];
}

export interface FinanceReportsPort {
  trialBalance(companyId: string): Promise<TrialBalanceSummary>;
  profitAndLoss(companyId: string): Promise<ProfitAndLossSummary>;
}

export interface ExecutiveKpis {
  revenueMonthToDate: number;
  grossProfit: number;
  outstandingReceivables: number;
}

export interface SalesKpis {
  customerCountsByStatus: Record<string, number>;
  quotationCountsByStatus: Record<string, number>;
  quoteWinRate: number;
  revenueByCustomer: Array<{ customerId: string; revenue: number }>;
  revenueByCountry: Array<{ country: string; revenue: number }>;
  revenueByProduct: Array<{ productId: string; revenue: number }>;
  rfqCountsByStatus: Record<string, number>;
}

export interface TradingKpis {
  rfqCountsByStatus: Record<string, number>;
  quotationCountsByStatus: Record<string, number>;
  orderCountsByStatus: Record<string, number>;
  marginByProduct: Array<{ productId: string; averageMarginPercent: number }>;
  marginByCustomer: Array<{ customerId: string; averageMarginPercent: number }>;
}

export interface InventoryKpis {
  stockByProduct: Array<{ productId: string; quantityOnHand: number }>;
  inventoryValue: number;
}

export interface ProcurementKpis {
  spendBySupplier: Array<{ supplierId: string; spend: number }>;
  spendMonthToDate: number;
}

export interface AiKpis {
  requestCount: number;
  totalCostUsd: number;
  automationRate: number;
  humanOverrideRate: number;
  promptSuccessRate: number;
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * All dashboard/KPI reads — real Prisma aggregate/groupBy queries (or a real fetch + in-memory
 * reduce, same technique Accounting's own `aggregateTrialBalance` already uses, when Prisma
 * can't express the computation in one query) over existing tables. No new tables for the
 * numbers themselves. See docs/DOMAIN_MODEL_PHASE7.md, Analytics section, for what's real here
 * and what's explicitly deferred (Cash Position, Business Health Score, Balance
 * Sheet/Aging/Tax Summary, Warehouse Utilization, Supplier/Delivery Performance, Shipment
 * Performance, HR/Knowledge analytics).
 */
@Injectable()
export class AnalyticsKpiService {
  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly financeReports: FinanceReportsPort,
  ) {}

  async getExecutiveKpis(companyId: string): Promise<ExecutiveKpis> {
    const monthStart = startOfMonth(new Date());
    const [revenueAgg, pnl, receivablesAgg] = await Promise.all([
      this.db.invoice.aggregate({
        where: { companyId, status: { not: 'VOID' }, createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      this.financeReports.profitAndLoss(companyId),
      this.db.invoice.aggregate({
        where: { companyId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        _sum: { totalAmount: true, amountPaid: true },
      }),
    ]);
    const outstandingReceivables =
      Number(receivablesAgg._sum.totalAmount ?? 0) - Number(receivablesAgg._sum.amountPaid ?? 0);
    return {
      revenueMonthToDate: Number(revenueAgg._sum.totalAmount ?? 0),
      grossProfit: pnl.netIncome,
      outstandingReceivables,
    };
  }

  async getSalesKpis(companyId: string): Promise<SalesKpis> {
    const [customerGroups, quotationGroups, rfqGroups, revenueByCustomerRaw, lineItems] =
      await Promise.all([
        this.db.customer.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
        this.db.quotation.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
        this.db.rfq.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
        this.db.order.groupBy({
          by: ['customerId'],
          where: { companyId },
          _sum: { totalAmount: true },
        }),
        this.db.orderLineItem.groupBy({
          by: ['productId'],
          where: { order: { companyId } },
          _sum: { lineTotal: true },
        }),
      ]);

    const customerCountsByStatus = Object.fromEntries(
      customerGroups.map((g) => [g.status, g._count._all]),
    );
    const quotationCountsByStatus = Object.fromEntries(
      quotationGroups.map((g) => [g.status, g._count._all]),
    );
    const rfqCountsByStatus = Object.fromEntries(rfqGroups.map((g) => [g.status, g._count._all]));

    const totalQuotations = quotationGroups.reduce((sum, g) => sum + g._count._all, 0);
    const convertedQuotations = quotationCountsByStatus['CONVERTED'] ?? 0;
    const quoteWinRate = ratio(convertedQuotations, totalQuotations);

    const revenueByCustomer = revenueByCustomerRaw.map((g) => ({
      customerId: g.customerId,
      revenue: Number(g._sum.totalAmount ?? 0),
    }));

    // Prisma can't groupBy across a relation (Order -> Customer.country) in one query — a real
    // second fetch resolves country per customer, then buckets in application code.
    const customerIds = revenueByCustomer.map((r) => r.customerId);
    const customers = customerIds.length
      ? await this.db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, country: true },
        })
      : [];
    const countryByCustomerId = new Map(customers.map((c) => [c.id, c.country]));
    const revenueByCountryMap = new Map<string, number>();
    for (const { customerId, revenue } of revenueByCustomer) {
      const country = countryByCustomerId.get(customerId) ?? 'UNKNOWN';
      revenueByCountryMap.set(country, (revenueByCountryMap.get(country) ?? 0) + revenue);
    }

    const revenueByProduct = lineItems.map((g) => ({
      productId: g.productId,
      revenue: Number(g._sum.lineTotal ?? 0),
    }));

    return {
      customerCountsByStatus,
      quotationCountsByStatus,
      quoteWinRate,
      revenueByCustomer,
      revenueByCountry: Array.from(revenueByCountryMap, ([country, revenue]) => ({
        country,
        revenue,
      })),
      revenueByProduct,
      rfqCountsByStatus,
    };
  }

  async getTradingKpis(companyId: string): Promise<TradingKpis> {
    const [rfqGroups, quotationGroups, orderGroups, quotationsWithMargin] = await Promise.all([
      this.db.rfq.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.db.quotation.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.db.order.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.db.quotation.findMany({
        where: { companyId, marginPercent: { not: null } },
        select: {
          customerId: true,
          marginPercent: true,
          currentVersionNumber: true,
          versions: {
            select: { versionNumber: true, lineItems: { select: { productId: true } } },
          },
        },
      }),
    ]);

    const marginByProductMap = new Map<string, { sum: number; count: number }>();
    const marginByCustomerMap = new Map<string, { sum: number; count: number }>();
    for (const q of quotationsWithMargin) {
      const margin = Number(q.marginPercent ?? 0);
      const custEntry = marginByCustomerMap.get(q.customerId) ?? { sum: 0, count: 0 };
      custEntry.sum += margin;
      custEntry.count += 1;
      marginByCustomerMap.set(q.customerId, custEntry);

      // marginPercent is denormalized onto Quotation from its current version — walk to that
      // version specifically for the product breakdown, not just any version's line items.
      const currentVersion = q.versions.find((v) => v.versionNumber === q.currentVersionNumber);
      for (const line of currentVersion?.lineItems ?? []) {
        const prodEntry = marginByProductMap.get(line.productId) ?? { sum: 0, count: 0 };
        prodEntry.sum += margin;
        prodEntry.count += 1;
        marginByProductMap.set(line.productId, prodEntry);
      }
    }

    return {
      rfqCountsByStatus: Object.fromEntries(rfqGroups.map((g) => [g.status, g._count._all])),
      quotationCountsByStatus: Object.fromEntries(
        quotationGroups.map((g) => [g.status, g._count._all]),
      ),
      orderCountsByStatus: Object.fromEntries(orderGroups.map((g) => [g.status, g._count._all])),
      marginByProduct: Array.from(marginByProductMap, ([productId, { sum, count }]) => ({
        productId,
        averageMarginPercent: ratio(sum, count),
      })),
      marginByCustomer: Array.from(marginByCustomerMap, ([customerId, { sum, count }]) => ({
        customerId,
        averageMarginPercent: ratio(sum, count),
      })),
    };
  }

  getFinanceKpis(companyId: string): Promise<{
    trialBalance: TrialBalanceSummary;
    profitAndLoss: ProfitAndLossSummary;
  }> {
    return Promise.all([
      this.financeReports.trialBalance(companyId),
      this.financeReports.profitAndLoss(companyId),
    ]).then(([trialBalance, profitAndLoss]) => ({ trialBalance, profitAndLoss }));
  }

  async getInventoryKpis(companyId: string): Promise<InventoryKpis> {
    const items = await this.db.inventoryItem.findMany({
      where: { companyId },
      select: {
        productId: true,
        quantityOnHand: true,
        product: { select: { standardCost: true } },
      },
    });
    const stockByProductMap = new Map<string, number>();
    let inventoryValue = 0;
    for (const item of items) {
      const qty = Number(item.quantityOnHand);
      stockByProductMap.set(item.productId, (stockByProductMap.get(item.productId) ?? 0) + qty);
      inventoryValue += qty * Number(item.product.standardCost ?? 0);
    }
    return {
      stockByProduct: Array.from(stockByProductMap, ([productId, quantityOnHand]) => ({
        productId,
        quantityOnHand,
      })),
      inventoryValue,
    };
  }

  async getProcurementKpis(companyId: string): Promise<ProcurementKpis> {
    const monthStart = startOfMonth(new Date());
    const [spendGroups, monthAgg] = await Promise.all([
      this.db.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: { companyId },
        _sum: { totalAmount: true },
      }),
      this.db.purchaseOrder.aggregate({
        where: { companyId, createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
    ]);
    return {
      spendBySupplier: spendGroups.map((g) => ({
        supplierId: g.supplierId,
        spend: Number(g._sum.totalAmount ?? 0),
      })),
      spendMonthToDate: Number(monthAgg._sum.totalAmount ?? 0),
    };
  }

  async getAiKpis(companyId: string): Promise<AiKpis> {
    const monthStart = startOfMonth(new Date());
    const [requestCount, completedCount, costAgg, toolTotal, toolAutomated, toolRejected] =
      await Promise.all([
        this.db.agentExecution.count({ where: { companyId } }),
        this.db.agentExecution.count({ where: { companyId, status: 'COMPLETED' } }),
        this.db.aiUsageRecord.aggregate({
          where: { companyId, success: true, createdAt: { gte: monthStart } },
          _sum: { costUsd: true },
        }),
        this.db.toolExecution.count({ where: { agentExecution: { companyId } } }),
        this.db.toolExecution.count({
          where: { agentExecution: { companyId }, approvalRequestId: null },
        }),
        this.db.toolExecution.count({
          where: { agentExecution: { companyId }, status: 'REJECTED' },
        }),
      ]);
    const toolWithApproval = toolTotal - toolAutomated;
    return {
      requestCount,
      totalCostUsd: Number(costAgg._sum.costUsd ?? 0),
      automationRate: ratio(toolAutomated, toolTotal),
      humanOverrideRate: ratio(toolRejected, toolWithApproval),
      promptSuccessRate: ratio(completedCount, requestCount),
    };
  }

  /** Trailing monthly revenue for the Sales Forecast basis — real order totals, month-truncated. */
  async getMonthlyRevenueHistory(companyId: string, months: number): Promise<TrendPoint[]> {
    const rows = await this.db.$queryRaw<Array<{ month: Date; total: string | null }>>`
      SELECT date_trunc('month', "created_at") AS month, SUM("total_amount")::text AS total
      FROM "orders"
      WHERE "company_id" = ${companyId}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT ${months}
    `;
    return rows
      .reverse()
      .map((r) => ({ period: r.month.toISOString().slice(0, 7), value: Number(r.total ?? 0) }));
  }

  /** The current KPI bag captured into a real AnalyticsSnapshot row — see analytics.service.ts. */
  async buildSnapshotMetrics(companyId: string): Promise<Record<string, unknown>> {
    const [executive, sales, procurement, ai] = await Promise.all([
      this.getExecutiveKpis(companyId),
      this.getSalesKpis(companyId),
      this.getProcurementKpis(companyId),
      this.getAiKpis(companyId),
    ]);
    return {
      revenueMonthToDate: executive.revenueMonthToDate,
      grossProfit: executive.grossProfit,
      outstandingReceivables: executive.outstandingReceivables,
      quoteWinRate: sales.quoteWinRate,
      purchaseSpendMonthToDate: procurement.spendMonthToDate,
      aiRequestCount: ai.requestCount,
      aiCostUsdMonthToDate: ai.totalCostUsd,
    };
  }
}
