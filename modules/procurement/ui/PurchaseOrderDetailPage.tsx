import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useCancelPurchaseOrder,
  useClosePurchaseOrder,
  usePurchaseOrder,
  useRequestPurchaseOrderApproval,
  useSendPurchaseOrder,
} from '../hooks/use-purchase-orders';

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: po, loading, error, refetch } = usePurchaseOrder(id!);
  const requestApproval = useRequestPurchaseOrderApproval();
  const send = useSendPurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const close = useClosePurchaseOrder();

  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !po)
    return <div className="error-banner">{error ?? 'Purchase order not found.'}</div>;

  const canReceive = po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED';

  return (
    <div>
      <div className="page-header">
        <h2>
          {po.poNumber} <span className="pill">{po.status}</span>
        </h2>
        <Link to="/purchase-orders">
          <button className="secondary">Back to purchase orders</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Total {po.totalAmount} {po.currency}
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Received</th>
              <th>Unit price</th>
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.productId}</td>
                <td>
                  {li.quantity} {li.uom}
                </td>
                <td>{li.receivedQuantity}</td>
                <td>{li.unitPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="button-row">
          {po.status === 'DRAFT' && (
            <button onClick={() => run(() => requestApproval(po.id))}>Request approval</button>
          )}
          {po.status === 'APPROVED' && (
            <button onClick={() => run(() => send(po.id))}>Send to supplier</button>
          )}
          {canReceive && (
            <Link to={`/goods-receipts/new?purchaseOrderId=${po.id}`}>
              <button>Record goods receipt</button>
            </Link>
          )}
          {po.status === 'RECEIVED' && (
            <button onClick={() => run(() => close(po.id))}>Close</button>
          )}
          {po.status !== 'CLOSED' && po.status !== 'CANCELLED' && (
            <button className="secondary" onClick={() => run(() => cancel(po.id))}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
