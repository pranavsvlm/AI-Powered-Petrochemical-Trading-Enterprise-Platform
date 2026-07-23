import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCloseOrder, useConfirmOrder, useFulfillOrderLine, useOrder } from '../hooks/use-orders';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, loading, error, refetch } = useOrder(id!);
  const confirm = useConfirmOrder();
  const close = useCloseOrder();
  const fulfillLine = useFulfillOrderLine();

  const [actionError, setActionError] = useState<string | null>(null);
  const [fulfillDrafts, setFulfillDrafts] = useState<Record<string, string>>({});

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
  if (error || !order) return <div className="error-banner">{error ?? 'Order not found.'}</div>;

  const canFulfill = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_FULFILLED';

  return (
    <div>
      <div className="page-header">
        <h2>
          {order.orderNumber} <span className="pill">{order.status}</span>
        </h2>
        <Link to="/orders">
          <button className="secondary">Back to orders</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Total {order.totalAmount} {order.currency}
          {order.incoterm && ` · ${order.incoterm}`}
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Fulfilled</th>
              <th>Unit price</th>
              {canFulfill && <th>Record fulfillment</th>}
            </tr>
          </thead>
          <tbody>
            {order.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.productId}</td>
                <td>
                  {li.quantity} {li.uom}
                </td>
                <td>{li.fulfilledQuantity}</td>
                <td>{li.unitPrice}</td>
                {canFulfill && (
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={fulfillDrafts[li.id] ?? ''}
                        onChange={(e) =>
                          setFulfillDrafts((d) => ({ ...d, [li.id]: e.target.value }))
                        }
                      />
                      <button
                        className="secondary"
                        onClick={() =>
                          run(() =>
                            fulfillLine(
                              order.id,
                              li.id,
                              Number(fulfillDrafts[li.id] ?? li.fulfilledQuantity),
                            ),
                          )
                        }
                      >
                        Update
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="button-row">
          {order.status === 'PENDING_CONFIRMATION' && (
            <button onClick={() => run(() => confirm(order.id))}>Confirm</button>
          )}
          {order.status === 'FULFILLED' && (
            <button onClick={() => run(() => close(order.id))}>Close order</button>
          )}
        </div>
      </div>
    </div>
  );
}
