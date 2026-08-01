import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAddProjectMember,
  useAddProjectMilestone,
  useCompleteMilestone,
  useProject,
} from '../hooks/use-projects';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, loading, error, refetch } = useProject(id!);
  const addMember = useAddProjectMember();
  const addMilestone = useAddProjectMilestone();
  const completeMilestone = useCompleteMilestone();

  const [actionError, setActionError] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDueDate, setMilestoneDueDate] = useState('');

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!memberUserId.trim()) return;
    const userId = memberUserId.trim();
    setMemberUserId('');
    await run(() => addMember(id!, userId));
  }

  async function handleAddMilestone(e: FormEvent) {
    e.preventDefault();
    if (!milestoneTitle.trim()) return;
    const title = milestoneTitle.trim();
    const dueDate = milestoneDueDate ? new Date(milestoneDueDate).toISOString() : undefined;
    setMilestoneTitle('');
    setMilestoneDueDate('');
    await run(() => addMilestone(id!, title, dueDate));
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !project) return <div className="error-banner">{error ?? 'Project not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {project.name} <span className="pill">{project.status}</span>
        </h2>
        <Link to="/projects">
          <button className="secondary">Back to projects</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        {project.description && <p>{project.description}</p>}
        <p>
          {project.startDate && <>Start {new Date(project.startDate).toLocaleDateString()}</>}
          {project.endDate && <> · End {new Date(project.endDate).toLocaleDateString()}</>}
          {project.budget && <> · Budget {project.budget}</>}
        </p>
      </div>

      <div className="card">
        <h3>Members</h3>
        {project.members.length === 0 && <p className="empty-state">No members yet.</p>}
        {project.members.map((m) => (
          <p key={m.id}>{m.userId}</p>
        ))}
        <form
          onSubmit={handleAddMember}
          className="line-item-row"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <input
            placeholder="Add member by user id…"
            value={memberUserId}
            onChange={(e) => setMemberUserId(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h3>Milestones</h3>
        {project.milestones.length === 0 && <p className="empty-state">No milestones yet.</p>}
        {project.milestones.map((m) => (
          <p key={m.id}>
            <span className="pill">{m.status}</span> {m.title}
            {m.dueDate && ` — due ${new Date(m.dueDate).toLocaleDateString()}`}
            {m.status === 'PENDING' && (
              <button
                className="secondary"
                style={{ marginLeft: 8 }}
                onClick={() => run(() => completeMilestone(m.id))}
              >
                Complete
              </button>
            )}
          </p>
        ))}
        <form onSubmit={handleAddMilestone} className="line-item-row">
          <input
            placeholder="Milestone title"
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
          />
          <input
            type="date"
            value={milestoneDueDate}
            onChange={(e) => setMilestoneDueDate(e.target.value)}
          />
          <button type="submit">Add milestone</button>
        </form>
      </div>

      <div className="card">
        <h3>Tasks</h3>
        {project.tasks.length === 0 && <p className="empty-state">No tasks linked yet.</p>}
        {project.tasks.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {project.tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                  </td>
                  <td>
                    <span className="pill">{t.status}</span>
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
