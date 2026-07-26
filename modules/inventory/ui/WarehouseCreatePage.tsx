import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateWarehouse } from '../hooks/use-warehouses';

export function WarehouseCreatePage() {
  const navigate = useNavigate();
  const createWarehouse = useCreateWarehouse();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createWarehouse({
        code,
        name,
        city: city || undefined,
        country: country || undefined,
        isDefault,
      });
      navigate('/warehouses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create warehouse.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New warehouse</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="code">Code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="isDefault">
            <input
              id="isDefault"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ width: 'auto', marginRight: 8 }}
            />
            Default warehouse for this company
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create warehouse'}
        </button>
      </form>
    </div>
  );
}
