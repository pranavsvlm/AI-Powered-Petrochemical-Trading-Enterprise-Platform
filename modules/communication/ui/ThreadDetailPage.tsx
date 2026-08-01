import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAddParticipant,
  useCloseThread,
  useCreateTaskFromThread,
  useSendMessage,
  useThread,
  type CommsMessageDirection,
  type NotificationChannel,
} from '../hooks/use-comms';

const CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH'];

export function ThreadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: thread, loading, error, refetch } = useThread(id!);
  const closeThread = useCloseThread();
  const addParticipant = useAddParticipant();
  const sendMessage = useSendMessage();
  const createTaskFromThread = useCreateTaskFromThread();

  const [actionError, setActionError] = useState<string | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);

  const [participantUserId, setParticipantUserId] = useState('');
  const [participantExternalName, setParticipantExternalName] = useState('');
  const [participantExternalIdentifier, setParticipantExternalIdentifier] = useState('');

  const [messageDirection, setMessageDirection] = useState<CommsMessageDirection>('OUTBOUND');
  const [messageChannel, setMessageChannel] = useState<NotificationChannel>('IN_APP');
  const [messageContent, setMessageContent] = useState('');

  const [taskTitle, setTaskTitle] = useState('');

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleAddParticipant(e: FormEvent) {
    e.preventDefault();
    const userId = participantUserId.trim();
    const externalName = participantExternalName.trim();
    const externalIdentifier = participantExternalIdentifier.trim();
    if (!userId && !externalIdentifier) return;
    setParticipantUserId('');
    setParticipantExternalName('');
    setParticipantExternalIdentifier('');
    await run(() =>
      addParticipant(id!, {
        userId: userId || undefined,
        externalName: externalName || undefined,
        externalIdentifier: externalIdentifier || undefined,
      }),
    );
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    if (!messageContent.trim()) return;
    const content = messageContent.trim();
    setMessageContent('');
    await run(() =>
      sendMessage(id!, { direction: messageDirection, channel: messageChannel, content }),
    );
  }

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const title = taskTitle.trim();
    setTaskTitle('');
    setTaskCreated(false);
    await run(async () => {
      await createTaskFromThread(id!, { title });
      setTaskCreated(true);
    });
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !thread) return <div className="error-banner">{error ?? 'Thread not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {thread.title ?? '(untitled thread)'} <span className="pill">{thread.status}</span>
        </h2>
        <Link to="/comms">
          <button className="secondary">Back to threads</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Type: <strong>{thread.type}</strong>
          {thread.subjectType && thread.subjectId && (
            <>
              {' '}
              · Linked to {thread.subjectType} ({thread.subjectId})
            </>
          )}
        </p>
        <div className="button-row" style={{ marginTop: 0 }}>
          <button
            className="secondary"
            onClick={() => run(() => closeThread(id!))}
            disabled={thread.status === 'CLOSED'}
          >
            Close thread
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Participants</h3>
        {thread.participants.length === 0 && <p className="empty-state">No participants yet.</p>}
        {thread.participants.map((p) => (
          <p key={p.id} style={{ fontSize: 13 }}>
            {p.userId ? `User ${p.userId}` : (p.externalName ?? 'External contact')}
            {p.externalIdentifier && ` · ${p.externalIdentifier}`}
          </p>
        ))}
        <form onSubmit={handleAddParticipant} className="button-row" style={{ flexWrap: 'wrap' }}>
          <input
            placeholder="Internal user id"
            value={participantUserId}
            onChange={(e) => setParticipantUserId(e.target.value)}
            style={{ width: 160 }}
          />
          <input
            placeholder="External name"
            value={participantExternalName}
            onChange={(e) => setParticipantExternalName(e.target.value)}
            style={{ width: 160 }}
          />
          <input
            placeholder="External email / identifier"
            value={participantExternalIdentifier}
            onChange={(e) => setParticipantExternalIdentifier(e.target.value)}
            style={{ width: 200 }}
          />
          <button type="submit">Add participant</button>
        </form>
      </div>

      <div className="card">
        <h3>Messages</h3>
        {thread.messages.length === 0 && <p className="empty-state">No messages yet.</p>}
        {thread.messages.map((m) => (
          <p key={m.id} style={{ fontSize: 13 }}>
            <strong>{m.direction}</strong> via {m.channel}
            {m.senderUserId && ` · ${m.senderUserId}`}
            {m.senderExternalName && ` · ${m.senderExternalName}`}
            {' · '}
            {new Date(m.createdAt).toLocaleString()}
            <br />
            {m.content}
          </p>
        ))}
        <form onSubmit={handleSendMessage} className="button-row" style={{ flexWrap: 'wrap' }}>
          <select
            value={messageDirection}
            onChange={(e) => setMessageDirection(e.target.value as CommsMessageDirection)}
          >
            <option value="OUTBOUND">Outbound</option>
            <option value="INBOUND">Inbound</option>
          </select>
          <select
            value={messageChannel}
            onChange={(e) => setMessageChannel(e.target.value as NotificationChannel)}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Message content…"
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="submit">Send</button>
        </form>
        {messageDirection === 'OUTBOUND' &&
          messageChannel !== 'EMAIL' &&
          messageChannel !== 'IN_APP' && (
            <p className="empty-state" style={{ padding: 0 }}>
              {messageChannel} isn't a connected send channel yet — sending will fail with a clear
              error. Only Email and In-App deliver for real today.
            </p>
          )}
      </div>

      <div className="card">
        <h3>Create a task from this thread</h3>
        {taskCreated && (
          <p className="empty-state">Task creation requested — check the Tasks list shortly.</p>
        )}
        <form
          onSubmit={handleCreateTask}
          className="line-item-row"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <input
            placeholder="Task title…"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <button type="submit">Create task</button>
        </form>
      </div>
    </div>
  );
}
