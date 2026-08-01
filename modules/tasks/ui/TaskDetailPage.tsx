import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAddChecklistItem,
  useAddTaskComment,
  useArchiveTask,
  useAssignTask,
  useChangeTaskStatus,
  useSetChecklistItemDone,
  useTask,
  type TaskStatus,
} from '../hooks/use-tasks';
import { useStartTimer, useStopTimer, useTimeEntries } from '../hooks/use-time-entries';

// Mirrors modules/tasks/domain/task-status.ts's FORWARD_TRANSITIONS on the backend — kept in
// sync by hand, same as every other enum this desktop app mirrors as a string union.
const FORWARD_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ['PLANNED', 'ARCHIVED'],
  PLANNED: ['IN_PROGRESS', 'BACKLOG', 'ARCHIVED'],
  IN_PROGRESS: ['REVIEW', 'PLANNED', 'ARCHIVED'],
  REVIEW: ['COMPLETED', 'IN_PROGRESS', 'ARCHIVED'],
  COMPLETED: ['IN_PROGRESS', 'REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, loading, error, refetch } = useTask(id!);
  const { data: timeEntries, refetch: refetchEntries } = useTimeEntries(id);
  const changeStatus = useChangeTaskStatus();
  const assign = useAssignTask();
  const archive = useArchiveTask();
  const addComment = useAddTaskComment();
  const addChecklistItem = useAddChecklistItem();
  const setChecklistItemDone = useSetChecklistItemDone();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();

  const [actionError, setActionError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [checklistLabel, setChecklistLabel] = useState('');
  const [assigneeInput, setAssigneeInput] = useState('');

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
      refetchEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    await run(() => addComment(id!, text));
  }

  async function handleAddChecklistItem(e: FormEvent) {
    e.preventDefault();
    if (!checklistLabel.trim()) return;
    const label = checklistLabel.trim();
    setChecklistLabel('');
    await run(() => addChecklistItem(id!, label));
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!assigneeInput.trim()) return;
    const userId = assigneeInput.trim();
    setAssigneeInput('');
    await run(() => assign(id!, userId));
  }

  const runningEntry = timeEntries?.find((t) => !t.endedAt);

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !task) return <div className="error-banner">{error ?? 'Task not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {task.title} <span className="pill">{task.status}</span>
        </h2>
        <Link to="/tasks">
          <button className="secondary">Back to tasks</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        {task.description && <p>{task.description}</p>}
        <p>
          Priority: <strong>{task.priority}</strong>
          {task.dueDate && <> · Due {new Date(task.dueDate).toLocaleDateString()}</>}
          {task.assigneeUserId && <> · Assigned to {task.assigneeUserId}</>}
        </p>
        {task.sourceModule && (
          <p className="empty-state" style={{ padding: 0 }}>
            Generated from {task.sourceModule}
            {task.sourceEntityId && ` (${task.sourceEntityId})`}
          </p>
        )}

        <div className="button-row">
          {FORWARD_TRANSITIONS[task.status].map((next) => (
            <button
              key={next}
              className={next === 'ARCHIVED' ? 'secondary' : undefined}
              onClick={() => run(() => changeStatus(id!, next))}
            >
              Move to {next.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleAssign}
          className="line-item-row"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <input
            placeholder="Assign to user id…"
            value={assigneeInput}
            onChange={(e) => setAssigneeInput(e.target.value)}
          />
          <button type="submit">Assign</button>
        </form>
      </div>

      <div className="card">
        <h3>Checklist</h3>
        {task.checklist.length === 0 && <p className="empty-state">No checklist items yet.</p>}
        {task.checklist.map((item) => (
          <p key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={(e) => run(() => setChecklistItemDone(id!, item.id, e.target.checked))}
                style={{ width: 'auto', marginRight: 8 }}
              />
              <span style={{ textDecoration: item.isDone ? 'line-through' : 'none' }}>
                {item.label}
              </span>
            </label>
          </p>
        ))}
        <form
          onSubmit={handleAddChecklistItem}
          className="line-item-row"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <input
            placeholder="Add a checklist item…"
            value={checklistLabel}
            onChange={(e) => setChecklistLabel(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h3>Time tracking</h3>
        <div className="button-row" style={{ marginTop: 0 }}>
          {runningEntry ? (
            <button onClick={() => run(() => stopTimer(runningEntry.id))}>Stop timer</button>
          ) : (
            <button onClick={() => run(() => startTimer({ taskId: id }))}>Start timer</button>
          )}
        </div>
        {timeEntries && timeEntries.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {timeEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.startedAt).toLocaleString()}</td>
                  <td>
                    {entry.durationMinutes != null ? `${entry.durationMinutes} min` : 'Running…'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Comments</h3>
        {task.comments.length === 0 && <p className="empty-state">No comments yet.</p>}
        {task.comments.map((c) => (
          <p key={c.id} style={{ fontSize: 13 }}>
            <strong>{c.authorUserId}</strong> · {new Date(c.createdAt).toLocaleString()}
            <br />
            {c.content}
          </p>
        ))}
        <form
          onSubmit={handleAddComment}
          className="line-item-row"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <input
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="submit">Comment</button>
        </form>
      </div>

      <div className="button-row">
        <button
          className="secondary"
          onClick={() => run(() => archive(id!))}
          disabled={task.status === 'ARCHIVED'}
        >
          Archive
        </button>
      </div>
    </div>
  );
}
