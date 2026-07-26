import { Link } from 'react-router-dom';
import { useInvoices } from '../hooks/use-invoices';

export function InvoiceListPage() {
  const { data: invoices, loading, error } = useInvoices();

  return (
    <div>
      <div className="page-header">
        <h2>Invoices</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && invoices && invoices.length === 0 && (
        <p className="empty-state">
          No invoices yet — they're generated automatically when an order is confirmed.
        </p>
      )}
      {!loading && invoices && invoices.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                </td>
                <td>
                  {inv.totalAmount} {inv.currency}
                </td>
                <td>{inv.amountPaid}</td>
                <td>
                  <span className="pill">{inv.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
