import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '@modules/customers/hooks/use-customers';
import { useProducts } from '@modules/products/hooks/use-products';
import { useCreateRfq, type CreateRfqLineInput } from '../hooks/use-rfqs';

const UOMS = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'];

function emptyLine(): CreateRfqLineInput {
  return { productId: '', quantity: 1, uom: 'MT' };
}

export function RfqCreatePage() {
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const createRfq = useCreateRfq();

  const [rfqNumber, setRfqNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [lineItems, setLineItems] = useState<CreateRfqLineInput[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(index: number, patch: Partial<CreateRfqLineInput>) {
    setLineItems((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLineItems((lines) => lines.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const rfq = await createRfq({ rfqNumber, customerId, currency, lineItems });
      navigate(`/rfqs/${rfq.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create RFQ.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New RFQ</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <div className="field">
          <label htmlFor="rfqNumber">RFQ number</label>
          <input
            id="rfqNumber"
            value={rfqNumber}
            onChange={(e) => setRfqNumber(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="customerId">Customer</label>
          <select
            id="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="">Select a customer…</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} ({c.customerCode})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <input
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
          />
        </div>

        <label style={{ fontSize: 12, color: '#6b6358' }}>Line items</label>
        {lineItems.map((line, i) => (
          <div className="line-item-row" key={i}>
            <select
              value={line.productId}
              onChange={(e) => updateLine(i, { productId: e.target.value })}
              required
            >
              <option value="">Select a product…</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={line.quantity}
              onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              required
            />
            <select value={line.uom} onChange={(e) => updateLine(i, { uom: e.target.value })}>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Target price"
              value={line.targetPrice ?? ''}
              onChange={(e) =>
                updateLine(i, { targetPrice: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <button
              type="button"
              className="secondary"
              onClick={() => removeLine(i)}
              disabled={lineItems.length <= 1}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={() => setLineItems((lines) => [...lines, emptyLine()])}
          >
            Add line item
          </button>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create RFQ'}
        </button>
      </form>
    </div>
  );
}
