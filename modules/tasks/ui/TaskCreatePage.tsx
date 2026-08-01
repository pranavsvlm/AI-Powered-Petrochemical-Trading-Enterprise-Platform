import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTask, type TaskPriority } from '../hooks/use-tasks';
import { useProjects } from '../hooks/use-projects';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function TaskCreatePage() {
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const { data: projects } = useProjects();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const task = await createTask({
        title,
        description: description || undefined,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        projectId: projectId || undefined,
        assigneeUserId: assigneeUserId || undefined,
      });
      navigate(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New task</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dueDate">Due date</label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="project">Project (optional)</label>
          <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assigneeUserId">Assignee user id (optional)</label>
          <input
            id="assigneeUserId"
            value={assigneeUserId}
            onChange={(e) => setAssigneeUserId(e.target.value)}
            placeholder="Leave blank to assign later"
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create task'}
        </button>
      </form>
    </div>
  );
}
