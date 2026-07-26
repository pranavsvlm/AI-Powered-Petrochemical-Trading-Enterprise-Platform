import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateSupplier } from '../hooks/use-suppliers';

export function SupplierCreatePage() {
  const navigate = useNavigate();
  const createSupplier = useCreateSupplier();

  const [supplierCode, setSupplierCode] = useState('');
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supplier = await createSupplier({ supplierCode, legalName, country, currency });
      navigate(`/suppliers/${supplier.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New supplier</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="supplierCode">Supplier code</label>
          <input
            id="supplierCode"
            value={supplierCode}
            onChange={(e) => setSupplierCode(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="legalName">Legal name</label>
          <input
            id="legalName"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <input
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          />
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
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create supplier'}
        </button>
      </form>
    </div>
  );
}
