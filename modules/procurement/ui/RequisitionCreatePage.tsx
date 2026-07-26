import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '@modules/products/hooks/use-products';
import { useCreateRequisition, type CreateRequisitionLineInput } from '../hooks/use-requisitions';

const UOMS = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'];

function emptyLine(): CreateRequisitionLineInput {
  return { productId: '', quantity: 1, uom: 'MT' };
}

export function RequisitionCreatePage() {
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const createRequisition = useCreateRequisition();

  const [requisitionNumber, setRequisitionNumber] = useState('');
  const [lineItems, setLineItems] = useState<CreateRequisitionLineInput[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(index: number, patch: Partial<CreateRequisitionLineInput>) {
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
      const requisition = await createRequisition({ requisitionNumber, lineItems });
      navigate(`/requisitions/${requisition.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create requisition.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New requisition</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <div className="field">
          <label htmlFor="requisitionNumber">Requisition number</label>
          <input
            id="requisitionNumber"
            value={requisitionNumber}
            onChange={(e) => setRequisitionNumber(e.target.value)}
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
              placeholder="Estimated unit price"
              value={line.estimatedUnitPrice ?? ''}
              onChange={(e) =>
                updateLine(i, {
                  estimatedUnitPrice: e.target.value ? Number(e.target.value) : undefined,
                })
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
          {submitting ? 'Creating…' : 'Create requisition'}
        </button>
      </form>
    </div>
  );
}
