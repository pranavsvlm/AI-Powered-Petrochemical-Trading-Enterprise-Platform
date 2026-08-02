import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCreateWebhook,
  useTestWebhook,
  useWebhookDeliveries,
  useWebhooks,
  type Webhook,
} from '../hooks/use-webhooks';

const SUPPORTED_EVENT_TYPES = ['OrderCreated'];

function DeliveriesRow({ webhook }: { webhook: Webhook }) {
  const [expanded, setExpanded] = useState(false);
  const { data: deliveries, refetch } = useWebhookDeliveries(expanded ? webhook.id : undefined);
  const testWebhook = useTestWebhook();
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    try {
      await testWebhook(webhook.id);
      setExpanded(true);
      await refetch();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <tr>
      <td>{webhook.url}</td>
      <td>{webhook.eventTypes.join(', ')}</td>
      <td>{new Date(webhook.createdAt).toLocaleDateString()}</td>
      <td>
        <div className="button-row" style={{ margin: 0 }}>
          <button className="secondary" disabled={testing} onClick={handleTest}>
            {testing ? 'Sending…' : 'Send test'}
          </button>
          <button className="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide deliveries' : 'Show deliveries'}
          </button>
        </div>
        {testError && <div className="error-banner">{testError}</div>}
        {expanded && (
          <div style={{ marginTop: 8 }}>
            {deliveries && deliveries.length === 0 && (
              <p className="empty-state">No deliveries yet.</p>
            )}
            {deliveries?.map((d) => (
              <p key={d.id} style={{ fontSize: 12 }}>
                <span className="pill">{d.status}</span> {d.eventType}
                {d.responseStatusCode != null && ` — HTTP ${d.responseStatusCode}`}
                {d.lastAttemptAt && ` · ${new Date(d.lastAttemptAt).toLocaleString()}`}
              </p>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export function WebhooksPage() {
  const { data: webhooks, loading, error, refetch } = useWebhooks();
  const createWebhook = useCreateWebhook();

  const [url, setUrl] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function toggleEventType(type: string) {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || eventTypes.length === 0) return;
    setCreateError(null);
    setCreating(true);
    try {
      await createWebhook(url.trim(), eventTypes);
      setUrl('');
      setEventTypes([]);
      await refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create webhook.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Webhooks</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {createError && (
        <div className="error-banner">
          {createError} Check the <Link to="/plugins">Plugins</Link> page — the Webhooks plugin must
          be installed and activated first.
        </div>
      )}

      <form className="card" onSubmit={handleCreate} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="webhookUrl">Destination URL</label>
          <input
            id="webhookUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhooks/navoasis"
          />
        </div>
        <div className="field">
          <label>Event types</label>
          {SUPPORTED_EVENT_TYPES.map((type) => (
            <label key={type} style={{ display: 'block', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={eventTypes.includes(type)}
                onChange={() => toggleEventType(type)}
                style={{ width: 'auto', marginRight: 8 }}
              />
              {type}
            </label>
          ))}
        </div>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create webhook'}
        </button>
      </form>

      {loading && <p className="empty-state">Loading…</p>}
      {!loading && webhooks && webhooks.length === 0 && (
        <p className="empty-state">No webhooks yet.</p>
      )}
      {!loading && webhooks && webhooks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Events</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <DeliveriesRow key={w.id} webhook={w} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
