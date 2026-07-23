import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/use-products';

export function ProductCatalogPage() {
  const { data: products, loading, error } = useProducts();

  return (
    <div>
      <div className="page-header">
        <h2>Products</h2>
        <Link to="/products/new">
          <button>New product</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && products && products.length === 0 && (
        <p className="empty-state">No products yet. Create the first one.</p>
      )}
      {!loading && products && products.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Base UoM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/products/${p.id}`}>{p.sku}</Link>
                </td>
                <td>{p.name}</td>
                <td>{p.baseUom}</td>
                <td>
                  <span className="pill">{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
