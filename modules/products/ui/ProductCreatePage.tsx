import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories, useCreateCategory, useCreateProduct } from '../hooks/use-products';

const UOMS = ['MT', 'KG', 'LITER', 'GALLON', 'BARREL', 'CUBIC_METER', 'PIECE'];

export function ProductCreatePage() {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const createCategory = useCreateCategory();
  const { data: categories, refetch: refetchCategories } = useCategories();

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [baseUom, setBaseUom] = useState('MT');
  const [standardCost, setStandardCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const category = await createCategory(newCategoryName.trim());
    setNewCategoryName('');
    refetchCategories();
    setCategoryId(category.id);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const product = await createProduct({
        sku,
        name,
        categoryId: categoryId || undefined,
        baseUom,
        standardCost: standardCost ? Number(standardCost) : undefined,
      });
      navigate(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New product</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="sku">SKU</label>
          <input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="line-item-row" style={{ gridTemplateColumns: '1fr auto', marginTop: 6 }}>
            <input
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button type="button" className="secondary" onClick={handleAddCategory}>
              Add
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="baseUom">Base unit of measure</label>
          <select id="baseUom" value={baseUom} onChange={(e) => setBaseUom(e.target.value)}>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="standardCost">Standard cost</label>
          <input
            id="standardCost"
            type="number"
            value={standardCost}
            onChange={(e) => setStandardCost(e.target.value)}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create product'}
        </button>
      </form>
    </div>
  );
}
