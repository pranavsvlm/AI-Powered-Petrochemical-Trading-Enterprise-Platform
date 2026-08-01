import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '../hooks/use-projects';

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const project = await createProject({
        name,
        description: description || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        budget: budget ? Number(budget) : undefined,
      });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New project</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
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
          <label htmlFor="startDate">Start date</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="endDate">End date</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="budget">Budget (optional)</label>
          <input
            id="budget"
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </div>
  );
}
