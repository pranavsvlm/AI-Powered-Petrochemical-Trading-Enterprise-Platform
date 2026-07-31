import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApproveExecution, useExecution, useRejectExecution } from '../hooks/use-executions';

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="empty-state">—</span>;
  return (
    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AiExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: execution, loading, error, refetch } = useExecution(id!);
  const approve = useApproveExecution();
  const reject = useRejectExecution();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDecide(decision: 'APPROVED' | 'REJECTED') {
    setActionError(null);
    try {
      if (decision === 'APPROVED') await approve(id!);
      else await reject(id!);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not record your decision.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !execution)
    return <div className="error-banner">{error ?? 'Execution not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {execution.agent.name} <span className="pill">{execution.status}</span>
        </h2>
        <Link to="/ai/executions">
          <button className="secondary">Back to executions</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Requested by <strong>{execution.requestedByUserId}</strong> ·{' '}
          {new Date(execution.createdAt).toLocaleString()}
          {execution.durationMs !== null && <> · {execution.durationMs}ms</>}
        </p>
        {(execution.totalTokens !== null || execution.totalCostUsd !== null) && (
          <p>
            {execution.totalTokens !== null && <>{execution.totalTokens} tokens</>}
            {execution.totalTokens !== null && execution.totalCostUsd !== null && ' · '}
            {execution.totalCostUsd !== null && <>${execution.totalCostUsd}</>}
          </p>
        )}
        <p>
          <strong>Message:</strong> {execution.input.userMessage}
        </p>
        {execution.output?.text && (
          <p>
            <strong>Reply:</strong> {execution.output.text}
          </p>
        )}
        {execution.errorMessage && <div className="error-banner">{execution.errorMessage}</div>}

        {execution.status === 'AWAITING_APPROVAL' && (
          <div className="button-row">
            <button onClick={() => handleDecide('APPROVED')}>Approve</button>
            <button className="secondary" onClick={() => handleDecide('REJECTED')}>
              Reject
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Tool calls</h3>
        {execution.toolExecutions.length === 0 && (
          <p className="empty-state">No tools were called for this execution.</p>
        )}
        {execution.toolExecutions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Status</th>
                <th>Input</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {execution.toolExecutions.map((te) => (
                <tr key={te.id}>
                  <td>
                    {te.tool.name}
                    <br />
                    <span className="empty-state" style={{ padding: 0 }}>
                      {te.tool.description}
                    </span>
                  </td>
                  <td>
                    <span className="pill">{te.status}</span>
                  </td>
                  <td>
                    <JsonBlock value={te.input} />
                  </td>
                  <td>{te.errorMessage ? te.errorMessage : <JsonBlock value={te.output} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
