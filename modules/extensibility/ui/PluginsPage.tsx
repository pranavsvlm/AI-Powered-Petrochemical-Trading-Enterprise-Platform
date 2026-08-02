import { useState } from 'react';
import {
  useActivatePlugin,
  useDeactivatePlugin,
  useInstallPlugin,
  usePlugins,
  useUninstallPlugin,
} from '../hooks/use-plugins';

function statusLabel(installed: boolean, enabled: boolean): string {
  if (!installed) return 'NOT INSTALLED';
  return enabled ? 'ACTIVE' : 'INSTALLED';
}

export function PluginsPage() {
  const { data: plugins, loading, error, refetch } = usePlugins();
  const install = useInstallPlugin();
  const activate = useActivatePlugin();
  const deactivate = useDeactivatePlugin();
  const uninstall = useUninstallPlugin();
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Plugins</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {actionError && <div className="error-banner">{actionError}</div>}

      {loading && <p className="empty-state">Loading…</p>}
      {!loading &&
        plugins?.map((p) => (
          <div key={p.key} className="card">
            <h3>
              {p.name} <span className="pill">{statusLabel(p.installed, p.enabled)}</span>
            </h3>
            <p>{p.description}</p>
            <p className="empty-state" style={{ padding: 0, fontSize: 12 }}>
              Category: {p.category}
            </p>
            <div className="button-row" style={{ marginTop: 12 }}>
              {!p.installed && <button onClick={() => run(() => install(p.key))}>Install</button>}
              {p.installed && !p.enabled && (
                <button onClick={() => run(() => activate(p.key))}>Activate</button>
              )}
              {p.installed && p.enabled && (
                <button className="secondary" onClick={() => run(() => deactivate(p.key))}>
                  Deactivate
                </button>
              )}
              {p.installed && (
                <button className="secondary" onClick={() => run(() => uninstall(p.key))}>
                  Uninstall
                </button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
