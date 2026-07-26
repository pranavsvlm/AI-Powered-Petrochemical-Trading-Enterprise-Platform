import { useProfitAndLoss, useTrialBalance } from '../hooks/use-reports';

export function ReportsPage() {
  const { data: trialBalance, loading: tbLoading, error: tbError } = useTrialBalance();
  const { data: pnl, loading: pnlLoading, error: pnlError } = useProfitAndLoss();

  return (
    <div>
      <div className="page-header">
        <h2>Reports</h2>
      </div>

      <div className="card">
        <h3>
          Trial Balance{' '}
          {trialBalance && (
            <span className="pill">{trialBalance.isBalanced ? 'Balanced' : 'Out of balance'}</span>
          )}
        </h3>
        {tbError && <div className="error-banner">{tbError}</div>}
        {tbLoading && <p className="empty-state">Loading…</p>}
        {!tbLoading && trialBalance && trialBalance.rows.length === 0 && (
          <p className="empty-state">No accounts yet — seed the chart of accounts first.</p>
        )}
        {!tbLoading && trialBalance && trialBalance.rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.rows.map((row) => (
                <tr key={row.accountId}>
                  <td>{row.accountCode}</td>
                  <td>{row.name}</td>
                  <td>
                    <span className="pill">{row.accountType}</span>
                  </td>
                  <td>{row.debitTotal}</td>
                  <td>{row.creditTotal}</td>
                  <td>{row.balance}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{trialBalance.totalDebits}</strong>
                </td>
                <td>
                  <strong>{trialBalance.totalCredits}</strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Profit &amp; Loss</h3>
        {pnlError && <div className="error-banner">{pnlError}</div>}
        {pnlLoading && <p className="empty-state">Loading…</p>}
        {!pnlLoading && pnl && (
          <>
            <p>
              Revenue {pnl.revenue} · Expenses {pnl.expenses} · Net income{' '}
              <strong>{pnl.netIncome}</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pnl.revenueLines.map((line) => (
                  <tr key={line.accountId}>
                    <td>
                      {line.accountCode} {line.name}
                    </td>
                    <td>{line.amount}</td>
                  </tr>
                ))}
                {pnl.expenseLines.map((line) => (
                  <tr key={line.accountId}>
                    <td>
                      {line.accountCode} {line.name}
                    </td>
                    <td>-{line.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
