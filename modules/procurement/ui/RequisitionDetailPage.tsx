import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRequisition, useSubmitRequisition } from '../hooks/use-requisitions';

export function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: requisition, loading, error, refetch } = useRequisition(id!);
  const submit = useSubmitRequisition();

  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSubmit() {
    setActionError(null);
    try {
      await submit(id!);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Submit failed.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !requisition)
    return <div className="error-banner">{error ?? 'Requisition not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {requisition.requisitionNumber} <span className="pill">{requisition.status}</span>
        </h2>
        <Link to="/requisitions">
          <button className="secondary">Back to requisitions</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Est. unit price</th>
            </tr>
          </thead>
          <tbody>
            {requisition.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.productId}</td>
                <td>
                  {li.quantity} {li.uom}
                </td>
                <td>{li.estimatedUnitPrice ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="button-row">
          {requisition.status === 'DRAFT' && (
            <button onClick={handleSubmit}>Submit for approval</button>
          )}
          {requisition.status === 'APPROVED' && (
            <Link to={`/purchase-orders/new?requisitionId=${requisition.id}`}>
              <button>Create purchase order</button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
