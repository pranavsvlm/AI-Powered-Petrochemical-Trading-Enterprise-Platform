import { FormEvent, useState } from 'react';
import {
  useAiProviders,
  useUpsertAiProvider,
  type AiProviderConfig,
  type AiProviderKind,
} from '../hooks/use-ai-providers';

const PROVIDER_KINDS: AiProviderKind[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'OLLAMA'];

interface FormState {
  provider: AiProviderKind;
  enabled: boolean;
  isDefault: boolean;
  priority: string;
  baseUrl: string;
  defaultChatModel: string;
  defaultEmbedModel: string;
  apiKeyRef: string;
  monthlyCostCeilingUsd: string;
}

function emptyForm(): FormState {
  return {
    provider: 'OLLAMA',
    enabled: true,
    isDefault: false,
    priority: '0',
    baseUrl: '',
    defaultChatModel: '',
    defaultEmbedModel: '',
    apiKeyRef: '',
    monthlyCostCeilingUsd: '',
  };
}

function formFromConfig(config: AiProviderConfig): FormState {
  return {
    provider: config.provider,
    enabled: config.enabled,
    isDefault: config.isDefault,
    priority: String(config.priority),
    baseUrl: config.baseUrl ?? '',
    defaultChatModel: config.defaultChatModel ?? '',
    defaultEmbedModel: config.defaultEmbedModel ?? '',
    apiKeyRef: config.apiKeyRef ?? '',
    monthlyCostCeilingUsd: config.monthlyCostCeilingUsd ?? '',
  };
}

export function AiProviderSettingsPage() {
  const { data: providers, loading, error, refetch } = useAiProviders();
  const upsert = useUpsertAiProvider();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      await upsert({
        provider: form.provider,
        enabled: form.enabled,
        isDefault: form.isDefault,
        priority: Number(form.priority),
        baseUrl: form.baseUrl || undefined,
        defaultChatModel: form.defaultChatModel || undefined,
        defaultEmbedModel: form.defaultEmbedModel || undefined,
        apiKeyRef: form.apiKeyRef || undefined,
        monthlyCostCeilingUsd: form.monthlyCostCeilingUsd
          ? Number(form.monthlyCostCeilingUsd)
          : undefined,
      });
      setForm(emptyForm());
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save provider.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>AI Providers</h2>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <h3>Add or update a provider</h3>
        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select
            id="provider"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as AiProviderKind })}
          >
            {PROVIDER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row" style={{ marginTop: 0 }}>
          <label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />{' '}
            Enabled
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />{' '}
            Preferred default
          </label>
        </div>
        <div className="field">
          <label htmlFor="priority">Priority (lower tries first)</label>
          <input
            id="priority"
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="baseUrl">
            Base URL (optional — defaults to the provider's standard endpoint)
          </label>
          <input
            id="baseUrl"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="defaultChatModel">Default chat model</label>
          <input
            id="defaultChatModel"
            placeholder="e.g. qwen2.5:3b"
            value={form.defaultChatModel}
            onChange={(e) => setForm({ ...form, defaultChatModel: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="defaultEmbedModel">Default embedding model</label>
          <input
            id="defaultEmbedModel"
            placeholder="e.g. nomic-embed-text"
            value={form.defaultEmbedModel}
            onChange={(e) => setForm({ ...form, defaultEmbedModel: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="apiKeyRef">
            API key reference (the name of an env var holding the key — never a raw key)
          </label>
          <input
            id="apiKeyRef"
            placeholder="e.g. OPENAI_API_KEY"
            value={form.apiKeyRef}
            onChange={(e) => setForm({ ...form, apiKeyRef: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="monthlyCostCeilingUsd">Monthly cost ceiling (USD, optional)</label>
          <input
            id="monthlyCostCeilingUsd"
            type="number"
            value={form.monthlyCostCeilingUsd}
            onChange={(e) => setForm({ ...form, monthlyCostCeilingUsd: e.target.value })}
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save provider'}
        </button>
      </form>

      <div className="card">
        <h3>Configured providers</h3>
        {error && <div className="error-banner">{error}</div>}
        {loading && <p className="empty-state">Loading…</p>}
        {!loading && providers && providers.length === 0 && (
          <p className="empty-state">No providers configured yet.</p>
        )}
        {!loading && providers && providers.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Enabled</th>
                <th>Default</th>
                <th>Priority</th>
                <th>Chat model</th>
                <th>Cost ceiling</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td>{p.enabled ? 'Yes' : 'No'}</td>
                  <td>{p.isDefault ? 'Yes' : 'No'}</td>
                  <td>{p.priority}</td>
                  <td>{p.defaultChatModel ?? '—'}</td>
                  <td>{p.monthlyCostCeilingUsd ?? '—'}</td>
                  <td>
                    <button className="secondary" onClick={() => setForm(formFromConfig(p))}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
