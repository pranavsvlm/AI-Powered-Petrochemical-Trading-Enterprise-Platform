import { FormEvent, useState } from 'react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/use-api-keys';

export function ApiKeysPage() {
  const { data: keys, loading, error, refetch } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ name: string; key: string } | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setActionError(null);
    setCreating(true);
    try {
      const created = await createKey(name.trim());
      setRevealedKey({ name: created.name, key: created.key });
      setName('');
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setActionError(null);
    try {
      await revokeKey(id);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revoke key.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>API Keys</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}

      {revealedKey && (
        <div className="card" style={{ borderColor: 'var(--accent, #b56a1f)' }}>
          <h3>{revealedKey.name}</h3>
          <p>
            This is the only time the full key is shown — copy it now. It authenticates as you and
            carries your current permissions; send it as an <code>X-Api-Key</code> header.
          </p>
          <p>
            <code style={{ userSelect: 'all', wordBreak: 'break-all' }}>{revealedKey.key}</code>
          </p>
          <button className="secondary" onClick={() => setRevealedKey(null)}>
            I've copied it
          </button>
        </div>
      )}

      <form className="card" onSubmit={handleCreate} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="keyName">New key name</label>
          <input
            id="keyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI pipeline"
          />
        </div>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {loading && <p className="empty-state">Loading…</p>}
      {!loading && keys && keys.length === 0 && <p className="empty-state">No API keys yet.</p>}
      {!loading && keys && keys.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>
                  <code>{k.keyPrefix}…</code>
                </td>
                <td>
                  <span className="pill">{k.revokedAt ? 'REVOKED' : 'ACTIVE'}</span>
                </td>
                <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                <td>
                  {!k.revokedAt && (
                    <button className="secondary" onClick={() => handleRevoke(k.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
