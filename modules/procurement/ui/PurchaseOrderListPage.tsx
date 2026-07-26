import { Link } from 'react-router-dom';
import { usePurchaseOrders } from '../hooks/use-purchase-orders';

export function PurchaseOrderListPage() {
  const { data: purchaseOrders, loading, error } = usePurchaseOrders();

  return (
    <div>
      <div className="page-header">
        <h2>Purchase Orders</h2>
        <Link to="/purchase-orders/new">
          <button>New purchase order</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && purchaseOrders && purchaseOrders.length === 0 && (
        <p className="empty-state">No purchase orders yet.</p>
      )}
      {!loading && purchaseOrders && purchaseOrders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link to={`/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                </td>
                <td>
                  {po.totalAmount} {po.currency}
                </td>
                <td>
                  <span className="pill">{po.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
