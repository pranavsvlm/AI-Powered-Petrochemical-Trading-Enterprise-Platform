import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAddContact,
  useCustomer,
  useCustomerTimeline,
  useTransitionCustomerStatus,
} from '../hooks/use-customers';

const NEXT_STATUS: Record<string, string[]> = {
  PROSPECT: ['QUALIFIED_LEAD', 'ACTIVE'],
  QUALIFIED_LEAD: ['ACTIVE'],
  ACTIVE: [],
  PENDING_APPROVAL: [],
  ARCHIVED: [],
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, loading, error, refetch } = useCustomer(id!);
  const { data: timeline } = useCustomerTimeline(id!);
  const transition = useTransitionCustomerStatus();
  const addContact = useAddContact();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleTransition(status: string) {
    setActionError(null);
    try {
      await transition(id!, status);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Transition failed.');
    }
  }

  async function handleAddContact(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    try {
      await addContact(id!, { firstName, lastName, email: contactEmail || undefined });
      setFirstName('');
      setLastName('');
      setContactEmail('');
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add contact.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !customer)
    return <div className="error-banner">{error ?? 'Customer not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {customer.legalName} <span className="pill">{customer.status}</span>
        </h2>
        <Link to="/customers">
          <button className="secondary">Back to customers</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          <strong>{customer.customerCode}</strong> · {customer.country} · {customer.currency}
        </p>
        {customer.customerType && <p>Type: {customer.customerType}</p>}
        {customer.creditLimit && <p>Credit limit: {customer.creditLimit}</p>}
        <div className="button-row">
          {(NEXT_STATUS[customer.status] ?? []).map((status) => (
            <button key={status} onClick={() => handleTransition(status)}>
              Move to {status.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Contacts</h3>
        {customer.contacts.length === 0 && <p className="empty-state">No contacts yet.</p>}
        {customer.contacts.map((contact) => (
          <p key={contact.id}>
            {contact.firstName} {contact.lastName}{' '}
            {contact.isPrimary && <span className="pill">Primary</span>}
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

      <div className="card">
        <h3>Timeline</h3>
        {(!timeline || timeline.length === 0) && (
          <p className="empty-state">No activity recorded yet.</p>
        )}
        {timeline?.map((entry, i) => (
          <p key={i} style={{ fontSize: 13 }}>
            <span className="pill">{entry.eventType}</span>{' '}
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        ))}
      </div>
    </div>
  );
}
