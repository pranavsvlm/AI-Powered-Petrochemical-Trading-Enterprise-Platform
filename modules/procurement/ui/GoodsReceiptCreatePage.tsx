import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWarehouses } from '@modules/inventory/hooks/use-warehouses';
import { usePurchaseOrder } from '../hooks/use-purchase-orders';
import {
  useCreateGoodsReceipt,
  type CreateGoodsReceiptLineInput,
} from '../hooks/use-goods-receipts';

const INSPECTION_RESULTS = ['PASSED', 'FAILED'] as const;

export function GoodsReceiptCreatePage() {
  const [searchParams] = useSearchParams();
  const purchaseOrderId = searchParams.get('purchaseOrderId') ?? '';
  const navigate = useNavigate();
  const { data: po } = usePurchaseOrder(purchaseOrderId);
  const { data: warehouses } = useWarehouses();
  const createGoodsReceipt = useCreateGoodsReceipt();

  const [receiptNumber, setReceiptNumber] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<Record<string, CreateGoodsReceiptLineInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function lineFor(purchaseOrderItemId: string): CreateGoodsReceiptLineInput {
    return (
      lines[purchaseOrderItemId] ?? {
        purchaseOrderItemId,
        quantityReceived: 0,
        inspectionResult: 'PASSED',
      }
    );
  }

  function updateLine(purchaseOrderItemId: string, patch: Partial<CreateGoodsReceiptLineInput>) {
    setLines((current) => ({
      ...current,
      [purchaseOrderItemId]: { ...lineFor(purchaseOrderItemId), ...patch },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const lineItems = Object.values(lines).filter((l) => l.quantityReceived > 0);
      const receipt = await createGoodsReceipt({
        receiptNumber,
        purchaseOrderId,
        warehouseId,
        lineItems,
      });
      navigate(`/purchase-orders/${receipt.purchaseOrderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record goods receipt.');
      setSubmitting(false);
    }
  }

  if (!purchaseOrderId) {
    return (
      <div className="error-banner">
        No purchase order selected — record a receipt from a purchase order's detail page.
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Record goods receipt</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <p>
          Purchase order: <code>{po?.poNumber ?? purchaseOrderId}</code>
        </p>
        <div className="field">
          <label htmlFor="receiptNumber">Receipt number</label>
          <input
            id="receiptNumber"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="warehouseId">Warehouse</label>
          <select
            id="warehouseId"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            <option value="">Select a warehouse…</option>
            {warehouses?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>

        <label style={{ fontSize: 12, color: '#6b6358' }}>Lines</label>
        {po?.lineItems.map((poLine) => {
          const outstanding = Number(poLine.quantity) - Number(poLine.receivedQuantity);
          const line = lineFor(poLine.id);
          return (
            <div className="line-item-row" key={poLine.id}>
              <span style={{ minWidth: 140 }}>
                {poLine.productId.slice(0, 8)} ({outstanding} outstanding)
              </span>
              <input
                type="number"
                min={0}
                max={outstanding}
                step="any"
                placeholder="Qty received"
                value={line.quantityReceived || ''}
                onChange={(e) =>
                  updateLine(poLine.id, { quantityReceived: Number(e.target.value) })
                }
              />
              <select
                value={line.inspectionResult}
                onChange={(e) =>
                  updateLine(poLine.id, {
                    inspectionResult: e.target
                      .value as CreateGoodsReceiptLineInput['inspectionResult'],
                  })
                }
              >
                {INSPECTION_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                placeholder="Batch number"
                value={line.batchNumber ?? ''}
                onChange={(e) =>
                  updateLine(poLine.id, { batchNumber: e.target.value || undefined })
                }
              />
            </div>
          );
        })}

        <button type="submit" disabled={submitting || !po}>
          {submitting ? 'Recording…' : 'Record receipt'}
        </button>
      </form>
    </div>
  );
}
