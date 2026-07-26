import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useActivateSupplier,
  useAddSupplierContact,
  useSupplier,
  useSuspendSupplier,
} from '../hooks/use-suppliers';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: supplier, loading, error, refetch } = useSupplier(id!);
  const suspend = useSuspendSupplier();
  const activate = useActivateSupplier();
  const addContact = useAddSupplierContact();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleAddContact(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await addContact(id!, { firstName, lastName, email: contactEmail || undefined });
      setFirstName('');
      setLastName('');
      setContactEmail('');
    });
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !supplier)
    return <div className="error-banner">{error ?? 'Supplier not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {supplier.legalName} <span className="pill">{supplier.status}</span>
        </h2>
        <Link to="/suppliers">
          <button className="secondary">Back to suppliers</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          <strong>{supplier.supplierCode}</strong> · {supplier.country} · {supplier.currency}
        </p>
        <div className="button-row">
          {supplier.status === 'ACTIVE' && (
            <button onClick={() => run(() => suspend(supplier.id))}>Suspend</button>
          )}
          {(supplier.status === 'PROSPECT' || supplier.status === 'SUSPENDED') && (
            <button onClick={() => run(() => activate(supplier.id))}>Activate</button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Contacts</h3>
        {(!supplier.contacts || supplier.contacts.length === 0) && (
          <p className="empty-state">No contacts yet.</p>
        )}
        {supplier.contacts?.map((contact) => (
          <p key={contact.id}>
            {contact.firstName} {contact.lastName}
            {contact.email && ` · ${contact.email}`}
          </p>
        ))}
        <form onSubmit={handleAddContact} style={{ marginTop: 12 }}>
          <div className="line-item-row">
            <input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
            <input
              placeholder="Email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <button type="submit">Add contact</button>
          </div>
        </form>
      </div>
    </div>
  );
}
