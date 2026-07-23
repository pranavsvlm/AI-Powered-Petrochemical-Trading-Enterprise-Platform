import { Link } from 'react-router-dom';
import { useCustomers } from '../hooks/use-customers';

export function CustomerListPage() {
  const { data: customers, loading, error } = useCustomers();

  return (
    <div>
      <div className="page-header">
        <h2>Customers</h2>
        <Link to="/customers/new">
          <button>New customer</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && customers && customers.length === 0 && (
        <p className="empty-state">No customers yet. Create the first one.</p>
      )}
      {!loading && customers && customers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Legal name</th>
              <th>Country</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/customers/${c.id}`}>{c.customerCode}</Link>
                </td>
                <td>{c.legalName}</td>
                <td>{c.country}</td>
                <td>
                  <span className="pill">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
