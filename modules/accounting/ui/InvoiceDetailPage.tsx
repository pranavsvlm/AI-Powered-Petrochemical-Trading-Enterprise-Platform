import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInvoice, usePayments, useRecordPayment } from '../hooks/use-invoices';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, loading, error, refetch } = useInvoice(id!);
  const { data: payments, refetch: refetchPayments } = usePayments(id!);
  const recordPayment = useRecordPayment();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSubmitting(true);
    try {
      await recordPayment(id!, {
        amount: Number(amount),
        currency: invoice!.currency,
        method: method || undefined,
      });
      setAmount('');
      setMethod('');
      refetch();
      refetchPayments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not record payment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !invoice) return <div className="error-banner">{error ?? 'Invoice not found.'}</div>;

  const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);

  return (
    <div>
      <div className="page-header">
        <h2>
          {invoice.invoiceNumber} <span className="pill">{invoice.status}</span>
        </h2>
        <Link to="/invoices">
          <button className="secondary">Back to invoices</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Total {invoice.totalAmount} {invoice.currency} · Paid {invoice.amountPaid} · Outstanding{' '}
          {outstanding}
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productId}</td>
                <td>{item.quantity}</td>
                <td>{item.unitPrice}</td>
                <td>{item.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Payments</h3>
        {(!payments || payments.length === 0) && (
          <p className="empty-state">No payments recorded yet.</p>
        )}
        {payments?.map((p) => (
          <p key={p.id}>
            {p.amount} {p.currency}
            {p.method && ` · ${p.method}`} · {new Date(p.paidAt).toLocaleString()}
          </p>
        ))}
        {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
          <form onSubmit={handleRecordPayment} style={{ marginTop: 12 }}>
            <div className="line-item-row">
              <input
                type="number"
                min={0.01}
                step="any"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <input
                placeholder="Method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
              <button type="submit" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
