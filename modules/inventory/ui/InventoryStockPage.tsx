import { Fragment, useState } from 'react';
import { useWarehouses } from '../hooks/use-warehouses';
import { useAdjustStock, useInventoryItems, useMovements } from '../hooks/use-inventory-items';

export function InventoryStockPage() {
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { data: items, loading, error, refetch } = useInventoryItems(warehouseId || undefined);
  const adjustStock = useAdjustStock();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: movements } = useMovements(expandedId ?? undefined);

  async function handleAdjust(itemId: string) {
    setActionError(null);
    try {
      await adjustStock(itemId, Number(quantityDelta), reason);
      setQuantityDelta('');
      setReason('');
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Adjustment failed.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Stock</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="warehouseFilter">Warehouse</label>
        <select
          id="warehouseFilter"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">All warehouses</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.code})
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="empty-state">Loading…</p>}
      {!loading && items && items.length === 0 && (
        <p className="empty-state">
          No stock recorded yet — receive goods against a purchase order.
        </p>
      )}
      {!loading && items && items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Warehouse</th>
              <th>On hand</th>
              <th>Reserved</th>
              <th>Available</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <code>{item.productId.slice(0, 8)}</code>
                  </td>
                  <td>
                    <code>{item.warehouseId.slice(0, 8)}</code>
                  </td>
                  <td>{item.quantityOnHand}</td>
                  <td>{item.quantityReserved}</td>
                  <td>{Number(item.quantityOnHand) - Number(item.quantityReserved)}</td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      {expandedId === item.id ? 'Hide' : 'Adjust / History'}
                    </button>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="card">
                        <div className="line-item-row">
                          <input
                            type="number"
                            placeholder="Quantity delta (+/-)"
                            value={quantityDelta}
                            onChange={(e) => setQuantityDelta(e.target.value)}
                          />
                          <input
                            placeholder="Reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                          <button onClick={() => handleAdjust(item.id)}>Apply adjustment</button>
                        </div>
                        <h3>Movements</h3>
                        {(!movements || movements.length === 0) && (
                          <p className="empty-state">No movements recorded yet.</p>
                        )}
                        {movements?.map((m) => (
                          <p key={m.id} style={{ fontSize: 13 }}>
                            <span className="pill">{m.movementType}</span> {m.quantity} ·{' '}
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
