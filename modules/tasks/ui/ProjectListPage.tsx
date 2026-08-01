import { Link } from 'react-router-dom';
import { useProjects } from '../hooks/use-projects';

export function ProjectListPage() {
  const { data: projects, loading, error } = useProjects();

  return (
    <div>
      <div className="page-header">
        <h2>Projects</h2>
        <Link to="/projects/new">
          <button>New project</button>
        </Link>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && projects && projects.length === 0 && (
        <p className="empty-state">No projects yet.</p>
      )}
      {!loading && projects && projects.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                </td>
                <td>
                  <span className="pill">{p.status}</span>
                </td>
                <td>{p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'}</td>
                <td>{p.endDate ? new Date(p.endDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
