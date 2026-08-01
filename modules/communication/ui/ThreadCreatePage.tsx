import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateThread, type CommsThreadType } from '../hooks/use-comms';

const TYPES: CommsThreadType[] = ['CUSTOMER', 'SUPPLIER', 'INTERNAL', 'ANNOUNCEMENT'];

export function ThreadCreatePage() {
  const navigate = useNavigate();
  const createThread = useCreateThread();

  const [type, setType] = useState<CommsThreadType>('INTERNAL');
  const [title, setTitle] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const thread = await createThread({
        type,
        title: title || undefined,
        subjectType: type === 'CUSTOMER' ? 'Customer' : subjectType || undefined,
        subjectId: subjectId || undefined,
      });
      navigate(`/comms/${thread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thread.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New thread</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as CommsThreadType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {type === 'CUSTOMER' && (
          <div className="field">
            <label htmlFor="subjectId">Customer id</label>
            <input
              id="subjectId"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Links this thread to a customer's CRM timeline"
            />
          </div>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create thread'}
        </button>
      </form>
    </div>
  );
}
