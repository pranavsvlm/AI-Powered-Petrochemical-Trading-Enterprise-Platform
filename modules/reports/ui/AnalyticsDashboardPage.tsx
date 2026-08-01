import { useState } from 'react';
import {
  useDashboardSection,
  useGenerateForecast,
  useGenerateInsight,
  useInsights,
  useLatestForecast,
  type AiKpis,
  type ExecutiveKpis,
  type FinanceKpis,
  type InventoryKpis,
  type ProcurementKpis,
  type SalesKpis,
  type TradingKpis,
} from '../hooks/use-analytics';

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function StatusCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <p className="empty-state">No data yet.</p>;
  return (
    <div className="button-row" style={{ marginTop: 0 }}>
      {entries.map(([status, count]) => (
        <span key={status} className="pill">
          {status}: {count}
        </span>
      ))}
    </div>
  );
}

export function AnalyticsDashboardPage() {
  const executive = useDashboardSection<ExecutiveKpis>('executive');
  const sales = useDashboardSection<SalesKpis>('sales');
  const trading = useDashboardSection<TradingKpis>('trading');
  const finance = useDashboardSection<FinanceKpis>('finance');
  const inventory = useDashboardSection<InventoryKpis>('inventory');
  const procurement = useDashboardSection<ProcurementKpis>('procurement');
  const ai = useDashboardSection<AiKpis>('ai');

  const { data: insights, refetch: refetchInsights } = useInsights();
  const generateInsight = useGenerateInsight();
  const { data: forecast, refetch: refetchForecast } = useLatestForecast();
  const generateForecast = useGenerateForecast();

  const [insightGenerating, setInsightGenerating] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [forecastGenerating, setForecastGenerating] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const latestInsight = insights?.[0];

  async function handleGenerateInsight() {
    setInsightError(null);
    setInsightGenerating(true);
    try {
      await generateInsight();
      await refetchInsights();
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Failed to generate briefing.');
    } finally {
      setInsightGenerating(false);
    }
  }

  async function handleGenerateForecast() {
    setForecastError(null);
    setForecastGenerating(true);
    try {
      await generateForecast();
      await refetchForecast();
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : 'Failed to generate forecast.');
    } finally {
      setForecastGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Analytics</h2>
      </div>

      <div className="card">
        <h3>Executive</h3>
        {executive.error && <div className="error-banner">{executive.error}</div>}
        {executive.loading && <p className="empty-state">Loading…</p>}
        {executive.data && (
          <div className="button-row" style={{ marginTop: 0 }}>
            <span className="pill">
              Revenue MTD: {formatMoney(executive.data.revenueMonthToDate)}
            </span>
            <span className="pill">Gross profit: {formatMoney(executive.data.grossProfit)}</span>
            <span className="pill">
              Outstanding receivables: {formatMoney(executive.data.outstandingReceivables)}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <h3>AI Business Briefing</h3>
        {insightError && <div className="error-banner">{insightError}</div>}
        {latestInsight ? (
          <p>{latestInsight.body}</p>
        ) : (
          <p className="empty-state">No briefing generated yet.</p>
        )}
        <div className="button-row" style={{ marginTop: 0 }}>
          <button onClick={handleGenerateInsight} disabled={insightGenerating}>
            {insightGenerating ? 'Generating…' : 'Generate briefing'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Sales Forecast</h3>
        {forecastError && <div className="error-banner">{forecastError}</div>}
        {forecast ? (
          <p>
            Projected next month's revenue:{' '}
            <strong>{formatMoney(Number(forecast.projectedValue))}</strong>{' '}
            <span className="empty-state" style={{ padding: 0 }}>
              (based on {forecast.basisPeriods} trailing month
              {forecast.basisPeriods === 1 ? '' : 's'})
            </span>
          </p>
        ) : (
          <p className="empty-state">No forecast generated yet.</p>
        )}
        <div className="button-row" style={{ marginTop: 0 }}>
          <button onClick={handleGenerateForecast} disabled={forecastGenerating}>
            {forecastGenerating ? 'Generating…' : 'Generate forecast'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Sales</h3>
        {sales.data && (
          <>
            <p>
              Quote win rate: <strong>{formatPercent(sales.data.quoteWinRate)}</strong>
            </p>
            <p className="empty-state" style={{ padding: 0 }}>
              Customers by status
            </p>
            <StatusCounts counts={sales.data.customerCountsByStatus} />
            <p className="empty-state" style={{ padding: '8px 0 0' }}>
              Revenue by customer
            </p>
            {sales.data.revenueByCustomer.length === 0 ? (
              <p className="empty-state">No revenue yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data.revenueByCustomer.map((r) => (
                    <tr key={r.customerId}>
                      <td>{r.customerId}</td>
                      <td>{formatMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Trading</h3>
        {trading.data && (
          <>
            <p className="empty-state" style={{ padding: 0 }}>
              Orders by status
            </p>
            <StatusCounts counts={trading.data.orderCountsByStatus} />
            <p className="empty-state" style={{ padding: '8px 0 0' }}>
              Quotations by status
            </p>
            <StatusCounts counts={trading.data.quotationCountsByStatus} />
          </>
        )}
      </div>

      <div className="card">
        <h3>Finance</h3>
        {finance.data && (
          <div className="button-row" style={{ marginTop: 0 }}>
            <span className="pill">
              Net income: {formatMoney(finance.data.profitAndLoss.netIncome)}
            </span>
            <span className="pill">
              Trial balance: {finance.data.trialBalance.isBalanced ? 'Balanced' : 'Out of balance'}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Inventory</h3>
        {inventory.data && (
          <>
            <p>
              Total inventory value: <strong>{formatMoney(inventory.data.inventoryValue)}</strong>
            </p>
            {inventory.data.stockByProduct.length === 0 ? (
              <p className="empty-state">No stock recorded.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity on hand</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.data.stockByProduct.map((s) => (
                    <tr key={s.productId}>
                      <td>{s.productId}</td>
                      <td>{s.quantityOnHand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Procurement</h3>
        {procurement.data && (
          <p>
            Spend this month: <strong>{formatMoney(procurement.data.spendMonthToDate)}</strong>
          </p>
        )}
      </div>

      <div className="card">
        <h3>AI Usage</h3>
        {ai.data && (
          <div className="button-row" style={{ marginTop: 0 }}>
            <span className="pill">Requests: {ai.data.requestCount}</span>
            <span className="pill">Cost: {formatMoney(ai.data.totalCostUsd)}</span>
            <span className="pill">Automation rate: {formatPercent(ai.data.automationRate)}</span>
            <span className="pill">
              Human override rate: {formatPercent(ai.data.humanOverrideRate)}
            </span>
            <span className="pill">
              Prompt success rate: {formatPercent(ai.data.promptSuccessRate)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
