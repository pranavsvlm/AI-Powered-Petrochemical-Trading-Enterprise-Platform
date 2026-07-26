import { Link } from 'react-router-dom';
import { useRequisitions } from '../hooks/use-requisitions';

export function RequisitionListPage() {
  const { data: requisitions, loading, error } = useRequisitions();

  return (
    <div>
      <div className="page-header">
        <h2>Purchase Requisitions</h2>
        <Link to="/requisitions/new">
          <button>New requisition</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && requisitions && requisitions.length === 0 && (
        <p className="empty-state">No requisitions yet.</p>
      )}
      {!loading && requisitions && requisitions.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Lines</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requisitions.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/requisitions/${r.id}`}>{r.requisitionNumber}</Link>
                </td>
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
