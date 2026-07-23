import { Link } from 'react-router-dom';
import { useRfqs } from '../hooks/use-rfqs';

export function RfqListPage() {
  const { data: rfqs, loading, error } = useRfqs();

  return (
    <div>
      <div className="page-header">
        <h2>RFQs</h2>
        <Link to="/rfqs/new">
          <button>New RFQ</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && rfqs && rfqs.length === 0 && <p className="empty-state">No RFQs yet.</p>}
      {!loading && rfqs && rfqs.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Currency</th>
              <th>Line items</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rfqs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/rfqs/${r.id}`}>{r.rfqNumber}</Link>
                </td>
                <td>{r.currency}</td>
                <td>{r.lineItems.length}</td>
                <td>
                  <span className="pill">{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
