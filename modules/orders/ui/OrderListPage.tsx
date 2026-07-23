import { Link } from 'react-router-dom';
import { useOrders } from '../hooks/use-orders';

export function OrderListPage() {
  const { data: orders, loading, error } = useOrders();

  return (
    <div>
      <div className="page-header">
        <h2>Orders</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && orders && orders.length === 0 && (
        <p className="empty-state">No orders yet — convert an approved quotation.</p>
      )}
      {!loading && orders && orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/orders/${o.id}`}>{o.orderNumber}</Link>
                </td>
                <td>
                  {o.totalAmount} {o.currency}
                </td>
                <td>
                  <span className="pill">{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
