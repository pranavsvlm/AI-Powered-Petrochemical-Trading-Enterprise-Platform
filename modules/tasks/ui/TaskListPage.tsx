import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTasks, type TaskStatus } from '../hooks/use-tasks';

const STATUS_OPTIONS: Array<{ value: TaskStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function TaskListPage() {
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const { data: tasks, loading, error } = useTasks(status || undefined);

  return (
    <div>
      <div className="page-header">
        <h2>Tasks</h2>
        <div className="button-row" style={{ margin: 0 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Link to="/tasks/new">
            <button>New task</button>
          </Link>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && tasks && tasks.length === 0 && <p className="empty-state">No tasks yet.</p>}
      {!loading && tasks && tasks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                </td>
                <td>{t.priority}</td>
                <td>
                  <span className="pill">{t.status}</span>
                </td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
