import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateEmployee,
  useDepartments,
  useTeams,
  type EmploymentType,
} from '../hooks/use-employees';

const EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const createEmployee = useCreateEmployee();
  const { data: departments } = useDepartments();
  const { data: teams } = useTeams();

  const [userId, setUserId] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('FULL_TIME');
  const [hireDate, setHireDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const teamsInDepartment = departmentId
    ? teams?.filter((t) => t.departmentId === departmentId)
    : teams;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const employee = await createEmployee({
        userId,
        employeeNumber,
        jobTitle,
        employmentType,
        hireDate: new Date(hireDate).toISOString(),
        departmentId: departmentId || undefined,
        teamId: teamId || undefined,
        managerId: managerId || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      });
      navigate(`/employees/${employee.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee.');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>New employee</h2>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="userId">User id</label>
          <input
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Existing platform user to link"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="employeeNumber">Employee number</label>
          <input
            id="employeeNumber"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="jobTitle">Job title</label>
          <input
            id="jobTitle"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="employmentType">Employment type</label>
          <select
            id="employmentType"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hireDate">Hire date</label>
          <input
            id="hireDate"
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="department">Department (optional)</label>
          <select
            id="department"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setTeamId('');
            }}
          >
            <option value="">No department</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="team">Team (optional)</label>
          <select id="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teamsInDepartment?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="managerId">Manager employee id (optional)</label>
          <input
            id="managerId"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            placeholder="Leave blank if none"
          />
        </div>
        <div className="field">
          <label htmlFor="emergencyContactName">Emergency contact name (optional)</label>
          <input
            id="emergencyContactName"
            value={emergencyContactName}
            onChange={(e) => setEmergencyContactName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="emergencyContactPhone">Emergency contact phone (optional)</label>
          <input
            id="emergencyContactPhone"
            value={emergencyContactPhone}
            onChange={(e) => setEmergencyContactPhone(e.target.value)}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create employee'}
        </button>
      </form>
    </div>
  );
}
