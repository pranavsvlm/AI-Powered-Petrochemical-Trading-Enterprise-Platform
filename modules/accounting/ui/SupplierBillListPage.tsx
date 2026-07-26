import { FormEvent, useState } from 'react';
import { useGenerateSupplierBill, useSupplierBills } from '../hooks/use-supplier-bills';

export function SupplierBillListPage() {
  const { data: bills, loading, error, refetch } = useSupplierBills();
  const generateBill = useGenerateSupplierBill();

  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSubmitting(true);
    try {
      await generateBill(purchaseOrderId);
      setPurchaseOrderId('');
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not generate supplier bill.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Supplier Bills</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}

      <form className="card" onSubmit={handleGenerate} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="purchaseOrderId">Generate from purchase order ID</label>
          <input
            id="purchaseOrderId"
            value={purchaseOrderId}
            onChange={(e) => setPurchaseOrderId(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Generating…' : 'Generate supplier bill'}
        </button>
      </form>

      {loading && <p className="empty-state">Loading…</p>}
      {!loading && bills && bills.length === 0 && (
        <p className="empty-state">No supplier bills yet.</p>
      )}
      {!loading && bills && bills.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id}>
                <td>{bill.billNumber}</td>
                <td>
                  {bill.totalAmount} {bill.currency}
                </td>
                <td>{bill.amountPaid}</td>
                <td>
                  <span className="pill">{bill.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
