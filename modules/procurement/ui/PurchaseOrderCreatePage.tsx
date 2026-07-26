import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProducts } from '@modules/products/hooks/use-products';
import { useSuppliers } from '../hooks/use-suppliers';
import {
  useCreatePurchaseOrderDirect,
  useCreatePurchaseOrderFromRequisition,
  type CreatePurchaseOrderLineInput,
} from '../hooks/use-purchase-orders';

const UOMS = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'];

function emptyLine(): CreatePurchaseOrderLineInput {
  return { productId: '', quantity: 1, uom: 'MT', unitPrice: 0 };
}

export function PurchaseOrderCreatePage() {
  const [searchParams] = useSearchParams();
  const requisitionId = searchParams.get('requisitionId');
  const navigate = useNavigate();
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProducts();
  const createDirect = useCreatePurchaseOrderDirect();
  const createFromRequisition = useCreatePurchaseOrderFromRequisition();

  const [poNumber, setPoNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [lineItems, setLineItems] = useState<CreatePurchaseOrderLineInput[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateLine(index: number, patch: Partial<CreatePurchaseOrderLineInput>) {
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
      const po = requisitionId
        ? await createFromRequisition({ poNumber, requisitionId, supplierId, currency })
        : await createDirect({ poNumber, supplierId, currency, lineItems });
      navigate(`/purchase-orders/${po.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New purchase order</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        {requisitionId && (
          <p>
            From requisition <code>{requisitionId}</code>
          </p>
        )}
        <div className="field">
          <label htmlFor="poNumber">PO number</label>
          <input
            id="poNumber"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="supplierId">Supplier</label>
          <select
            id="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">Select a supplier…</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.legalName} ({s.supplierCode})
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

        {!requisitionId && (
          <>
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
                  placeholder="Unit price"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                  required
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
          </>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create purchase order'}
        </button>
      </form>
    </div>
  );
}
