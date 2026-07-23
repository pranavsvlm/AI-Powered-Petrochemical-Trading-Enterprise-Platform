import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useProduct,
  usePriceLists,
  useRequestProductApproval,
  useUpsertPriceListEntry,
} from '../hooks/use-products';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, loading, error, refetch } = useProduct(id!);
  const { data: priceLists, refetch: refetchPrices } = usePriceLists(id!);
  const requestApproval = useRequestProductApproval();
  const upsertPrice = useUpsertPriceListEntry();

  const [currency, setCurrency] = useState('USD');
  const [unitPrice, setUnitPrice] = useState('');
  const [minQuantity, setMinQuantity] = useState('0');
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleRequestApproval() {
    setActionError(null);
    try {
      await requestApproval(id!);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval request failed.');
    }
  }

  async function handleAddPrice(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    try {
      await upsertPrice(id!, {
        currency,
        uom: product!.baseUom,
        minQuantity: Number(minQuantity),
        unitPrice: Number(unitPrice),
      });
      setUnitPrice('');
      refetchPrices();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add price.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !product) return <div className="error-banner">{error ?? 'Product not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {product.name} <span className="pill">{product.status}</span>
        </h2>
        <Link to="/products">
          <button className="secondary">Back to products</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          <strong>{product.sku}</strong> · base UoM {product.baseUom}
        </p>
        {product.standardCost && <p>Standard cost: {product.standardCost}</p>}
        {product.status === 'DRAFT' && (
          <div className="button-row">
            <button onClick={handleRequestApproval}>Request approval / activate</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Price lists</h3>
        {(!priceLists || priceLists.length === 0) && (
          <p className="empty-state">No price list entries yet.</p>
        )}
        {priceLists?.map((p) => (
          <p key={p.id}>
            {p.customerId ? `Customer ${p.customerId}` : 'General'} — {p.unitPrice} {p.currency} /{' '}
            {p.uom} (min qty {p.minQuantity})
          </p>
        ))}
        <form onSubmit={handleAddPrice} style={{ marginTop: 12 }}>
          <div className="line-item-row">
            <input
              placeholder="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              required
            />
            <input
              placeholder="Min quantity"
              type="number"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
            />
            <input
              placeholder="Unit price"
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              required
            />
            <button type="submit">Add price</button>
          </div>
        </form>
      </div>
    </div>
  );
}
