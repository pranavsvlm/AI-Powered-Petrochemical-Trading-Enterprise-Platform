import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateCustomer } from '../hooks/use-customers';

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const createCustomer = useCreateCustomer();
  const [customerCode, setCustomerCode] = useState('');
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [customerType, setCustomerType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const customer = await createCustomer({
        customerCode,
        legalName,
        country,
        currency,
        customerType: customerType || undefined,
      });
      navigate(`/customers/${customer.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New customer</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="customerCode">Customer code</label>
          <input
            id="customerCode"
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value)}
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
        <div className="field">
          <label htmlFor="customerType">Customer type</label>
          <select
            id="customerType"
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
          >
            <option value="">—</option>
            <option value="DISTRIBUTOR">Distributor</option>
            <option value="END_USER">End user</option>
            <option value="TRADER">Trader</option>
            <option value="MANUFACTURER">Manufacturer</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create customer'}
        </button>
      </form>
    </div>
  );
}
