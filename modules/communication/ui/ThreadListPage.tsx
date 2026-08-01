import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useThreads, type CommsThreadStatus, type CommsThreadType } from '../hooks/use-comms';

const TYPE_OPTIONS: Array<{ value: CommsThreadType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
];

const STATUS_OPTIONS: Array<{ value: CommsThreadStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CLOSED', label: 'Closed' },
];

export function ThreadListPage() {
  const [type, setType] = useState<CommsThreadType | ''>('');
  const [status, setStatus] = useState<CommsThreadStatus | ''>('');
  const { data: threads, loading, error } = useThreads(type || undefined, status || undefined);

  return (
    <div>
      <div className="page-header">
        <h2>Communication</h2>
        <div className="button-row" style={{ margin: 0 }}>
          <select value={type} onChange={(e) => setType(e.target.value as CommsThreadType | '')}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CommsThreadStatus | '')}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Link to="/comms/new">
            <button>New thread</button>
          </Link>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && threads && threads.length === 0 && (
        <p className="empty-state">No threads yet.</p>
      )}
      {!loading && threads && threads.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/comms/${t.id}`}>{t.title ?? '(untitled thread)'}</Link>
                </td>
                <td>{t.type}</td>
                <td>
                  <span className="pill">{t.status}</span>
                </td>
                <td>{new Date(t.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
