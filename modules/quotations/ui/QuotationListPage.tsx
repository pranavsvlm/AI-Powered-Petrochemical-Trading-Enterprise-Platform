import { Link } from 'react-router-dom';
import { useQuotations } from '../hooks/use-quotations';

export function QuotationListPage() {
  const { data: quotations, loading, error } = useQuotations();

  return (
    <div>
      <div className="page-header">
        <h2>Quotations</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && quotations && quotations.length === 0 && (
        <p className="empty-state">No quotations yet — generate one from an RFQ.</p>
      )}
      {!loading && quotations && quotations.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link to={`/quotations/${q.id}`}>{q.quotationNumber}</Link>
                </td>
                <td>
                  {q.totalAmount} {q.currency}
                </td>
                <td>
                  <span className="pill">{q.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
