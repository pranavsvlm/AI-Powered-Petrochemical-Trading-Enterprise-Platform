import { Link } from 'react-router-dom';
import { useWarehouses } from '../hooks/use-warehouses';

export function WarehouseListPage() {
  const { data: warehouses, loading, error } = useWarehouses();

  return (
    <div>
      <div className="page-header">
        <h2>Warehouses</h2>
        <Link to="/warehouses/new">
          <button>New warehouse</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && warehouses && warehouses.length === 0 && (
        <p className="empty-state">No warehouses yet — create one to start receiving stock.</p>
      )}
      {!loading && warehouses && warehouses.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Location</th>
              <th>Default</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id}>
                <td>{w.code}</td>
                <td>{w.name}</td>
                <td>{[w.city, w.country].filter(Boolean).join(', ') || '—'}</td>
                <td>{w.isDefault ? <span className="pill">Default</span> : ''}</td>
                <td>
                  <span className="pill">{w.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
