import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '@platform/ui';
import { useAgent, useAgents } from '../hooks/use-agents';
import { useSendChatMessage } from '../hooks/use-chat';
import {
  useApproveExecution,
  useRejectExecution,
  type AgentExecutionDetail,
  type AgentExecutionResult,
} from '../hooks/use-executions';

interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  executionId?: string;
  awaitingApproval?: boolean;
}

interface AgentSession {
  conversationId?: string;
  messages: TranscriptEntry[];
}

/**
 * Session-only transcript, per agent key, kept in component state — not persisted, lost on
 * reload. The underlying conversation continues correctly server-side (conversationId is
 * still passed on the next message), and the full audit trail is always recoverable via
 * /ai/executions, so this is a documented UX trade-off, not a data-loss bug.
 */
export function AiChatPage() {
  const api = useApiClient();
  const { data: agents, loading: agentsLoading, error: agentsError } = useAgents();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendChat = useSendChatMessage();
  const approve = useApproveExecution();
  const reject = useRejectExecution();

  const activeKey = selectedKey ?? agents?.[0]?.key ?? null;
  const session: AgentSession = (activeKey && sessions[activeKey]) || { messages: [] };
  const { data: activeAgentDetail } = useAgent(activeKey ?? undefined);

  function updateSession(key: string, updater: (s: AgentSession) => AgentSession) {
    setSessions((prev) => ({ ...prev, [key]: updater(prev[key] ?? { messages: [] }) }));
  }

  async function appendResult(key: string, result: AgentExecutionResult) {
    if (result.status === 'COMPLETED') {
      updateSession(key, (s) => ({
        conversationId: result.conversationId ?? s.conversationId,
        messages: [
          ...s.messages,
          {
            role: 'assistant',
            text: result.output?.text ?? '(no response)',
            executionId: result.id,
          },
        ],
      }));
    } else if (result.status === 'AWAITING_APPROVAL') {
      const detail = await api.get<AgentExecutionDetail>(`/ai/executions/${result.id}`);
      const pending = detail.toolExecutions.find((te) => te.status === 'AWAITING_APPROVAL');
      const label = pending
        ? `This wants to: ${pending.tool.name} — ${pending.tool.description}`
        : 'This action needs your approval before it can continue.';
      updateSession(key, (s) => ({
        conversationId: result.conversationId ?? s.conversationId,
        messages: [
          ...s.messages,
          { role: 'assistant', text: label, executionId: result.id, awaitingApproval: true },
        ],
      }));
    } else {
      updateSession(key, (s) => ({
        conversationId: result.conversationId ?? s.conversationId,
        messages: [
          ...s.messages,
          {
            role: 'assistant',
            text: `Error: ${result.errorMessage ?? 'The agent could not complete this request.'}`,
            executionId: result.id,
          },
        ],
      }));
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!activeKey || !draft.trim()) return;
    const message = draft.trim();
    setDraft('');
    setError(null);
    updateSession(activeKey, (s) => ({
      ...s,
      messages: [...s.messages, { role: 'user', text: message }],
    }));
    setSending(true);
    try {
      const result = await sendChat(activeKey, message, session.conversationId);
      await appendResult(activeKey, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  async function handleDecide(key: string, executionId: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null);
    updateSession(key, (s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.executionId === executionId ? { ...m, awaitingApproval: false } : m,
      ),
    }));
    try {
      const result =
        decision === 'APPROVED' ? await approve(executionId) : await reject(executionId);
      await appendResult(key, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your decision.');
    }
  }

  if (agentsLoading) return <p className="empty-state">Loading agents…</p>;
  if (agentsError || !agents)
    return <div className="error-banner">{agentsError ?? 'Could not load agents.'}</div>;

  const activeAgent = agents.find((a) => a.key === activeKey);

  return (
    <div>
      <div className="page-header">
        <h2>AI Assistant</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="button-row">
        {agents.map((agent) => (
          <button
            key={agent.key}
            className={agent.key === activeKey ? '' : 'secondary'}
            onClick={() => setSelectedKey(agent.key)}
          >
            {agent.name}
          </button>
        ))}
      </div>

      {activeKey && (
        <div className="card">
          {activeAgent && (
            <p className="empty-state" style={{ padding: 0, marginBottom: 4 }}>
              {activeAgent.description}
            </p>
          )}
          {activeAgentDetail && (
            <p className="empty-state" style={{ padding: 0, marginBottom: 12, fontSize: 12 }}>
              Can: {activeAgentDetail.tools.map((t) => t.name).join(', ')}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {session.messages.length === 0 && (
              <p className="empty-state">Say hello to get started.</p>
            )}
            {session.messages.map((m, i) => (
              <div key={i} style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
                <p style={{ margin: 0, fontWeight: m.role === 'user' ? 600 : 400 }}>{m.text}</p>
                {m.executionId && !m.awaitingApproval && (
                  <Link to={`/ai/executions/${m.executionId}`} style={{ fontSize: 12 }}>
                    View full trail →
                  </Link>
                )}
                {m.awaitingApproval && (
                  <div
                    className="button-row"
                    style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
                  >
                    <button onClick={() => handleDecide(activeKey, m.executionId!, 'APPROVED')}>
                      Approve
                    </button>
                    <button
                      className="secondary"
                      onClick={() => handleDecide(activeKey, m.executionId!, 'REJECTED')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSend}
            className="line-item-row"
            style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}
          >
            <input
              placeholder="Ask the agent to do something…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
