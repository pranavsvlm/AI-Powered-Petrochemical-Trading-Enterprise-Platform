import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCreateOrderFromQuotation } from '../hooks/use-orders';

export function OrderCreatePage() {
  const [searchParams] = useSearchParams();
  const quotationId = searchParams.get('quotationId') ?? '';
  const navigate = useNavigate();
  const createFromQuotation = useCreateOrderFromQuotation();

  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const order = await createFromQuotation(orderNumber, quotationId);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order.');
      setSubmitting(false);
    }
  }

  if (!quotationId) {
    return (
      <div className="error-banner">
        No quotation selected — convert to order from a quotation's detail page.
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Confirm order from quotation</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <p>
          Source quotation: <code>{quotationId}</code>
        </p>
        <div className="field">
          <label htmlFor="orderNumber">Order number</label>
          <input
            id="orderNumber"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create order'}
        </button>
      </form>
    </div>
  );
}
