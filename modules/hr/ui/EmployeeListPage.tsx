import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDepartments, useEmployees } from '../hooks/use-employees';

export function EmployeeListPage() {
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments } = useDepartments();
  const { data: employees, loading, error } = useEmployees(departmentId || undefined);

  return (
    <div>
      <div className="page-header">
        <h2>Employees</h2>
        <div className="button-row" style={{ margin: 0 }}>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Link to="/employees/new">
            <button>New employee</button>
          </Link>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && employees && employees.length === 0 && (
        <p className="empty-state">No employees yet.</p>
      )}
      {!loading && employees && employees.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Employee #</th>
              <th>Job title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Hire date</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link to={`/employees/${e.id}`}>{e.employeeNumber}</Link>
                </td>
                <td>{e.jobTitle}</td>
                <td>{e.employmentType.replace('_', ' ')}</td>
                <td>
                  <span className="pill">{e.employmentStatus}</span>
                </td>
                <td>{new Date(e.hireDate).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
