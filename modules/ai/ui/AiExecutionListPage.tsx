import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExecutions, type AgentExecutionStatus } from '../hooks/use-executions';

const STATUS_OPTIONS: Array<{ value: AgentExecutionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function AiExecutionListPage() {
  const [status, setStatus] = useState<AgentExecutionStatus | ''>('');
  const { data: executions, loading, error } = useExecutions(status || undefined);

  return (
    <div>
      <div className="page-header">
        <h2>AI Executions</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AgentExecutionStatus | '')}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && executions && executions.length === 0 && (
        <p className="empty-state">No executions yet.</p>
      )}
      {!loading && executions && executions.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Requested by</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((exec) => (
              <tr key={exec.id}>
                <td>
                  <Link to={`/ai/executions/${exec.id}`}>{exec.agent.name}</Link>
                </td>
                <td>
                  <span className="pill">{exec.status}</span>
                </td>
                <td>{exec.requestedByUserId}</td>
                <td>{new Date(exec.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
