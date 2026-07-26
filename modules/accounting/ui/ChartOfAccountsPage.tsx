import { useState } from 'react';
import { useChartOfAccounts, useSeedDefaultChart } from '../hooks/use-chart-of-accounts';

export function ChartOfAccountsPage() {
  const { data: accounts, loading, error, refetch } = useChartOfAccounts();
  const seedDefaults = useSeedDefaultChart();
  const [actionError, setActionError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    setActionError(null);
    setSeeding(true);
    try {
      await seedDefaults();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not seed default chart.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Chart of Accounts</h2>
        <button onClick={handleSeed} disabled={seeding}>
          {seeding ? 'Seeding…' : 'Seed default chart'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && accounts && accounts.length === 0 && (
        <p className="empty-state">
          No accounts yet — seed the default chart to start posting invoices/journals.
        </p>
      )}
      {!loading && accounts && accounts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.accountCode}</td>
                <td>{a.name}</td>
                <td>
                  <span className="pill">{a.accountType}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
