import { Link } from 'react-router-dom';
import { useSuppliers } from '../hooks/use-suppliers';

export function SupplierListPage() {
  const { data: suppliers, loading, error } = useSuppliers();

  return (
    <div>
      <div className="page-header">
        <h2>Suppliers</h2>
        <Link to="/suppliers/new">
          <button>New supplier</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && suppliers && suppliers.length === 0 && (
        <p className="empty-state">No suppliers yet.</p>
      )}
      {!loading && suppliers && suppliers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Country</th>
              <th>Currency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/suppliers/${s.id}`}>{s.supplierCode}</Link>
                </td>
                <td>{s.legalName}</td>
                <td>{s.country}</td>
                <td>{s.currency}</td>
                <td>
                  <span className="pill">{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
