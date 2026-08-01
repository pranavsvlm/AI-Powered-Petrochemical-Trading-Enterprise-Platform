import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useDepartments,
  useEmployee,
  useTeams,
  useUpdateEmployee,
  type EmploymentStatus,
} from '../hooks/use-employees';
import { useAttendance, useClockIn, useClockOut, useShifts } from '../hooks/use-attendance';
import {
  useCreateLeavePolicy,
  useDecideLeave,
  useLeaveBalance,
  useLeavePolicies,
  useLeaveRequests,
  usePendingApprovals,
  useRequestLeave,
  type LeaveRequest,
  type LeaveType,
} from '../hooks/use-leave';
import {
  useAddPerformanceReview,
  useAddTrainingRecord,
  useAssignAsset,
  useEmployeeAssets,
  usePayrollProfile,
  usePerformanceReviews,
  useReturnAsset,
  useSetPayrollProfile,
  useTrainingRecords,
} from '../hooks/use-employee-records';

const STATUS_OPTIONS: EmploymentStatus[] = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];
const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'UNPAID', 'CUSTOM'];

function LeaveRequestRow({ request, onDecided }: { request: LeaveRequest; onDecided: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: approvals, refetch } = usePendingApprovals(expanded ? request.id : undefined);
  const decide = useDecideLeave();
  const [error, setError] = useState<string | null>(null);

  async function handleDecide(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null);
    try {
      await decide(approvalId, decision);
      await refetch();
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed.');
    }
  }

  return (
    <tr>
      <td>{new Date(request.startDate).toLocaleDateString()}</td>
      <td>{new Date(request.endDate).toLocaleDateString()}</td>
      <td>
        <span className="pill">{request.status}</span>
      </td>
      <td>{request.reason ?? '—'}</td>
      <td>
        {request.status === 'PENDING' && !expanded && (
          <button className="secondary" onClick={() => setExpanded(true)}>
            Review
          </button>
        )}
        {request.status === 'PENDING' && expanded && (
          <>
            {error && <span style={{ color: 'var(--danger, #c0392b)' }}>{error}</span>}
            {approvals && approvals.length === 0 && (
              <span className="empty-state">No pending approval found.</span>
            )}
            {approvals?.map((a) => (
              <span key={a.id} className="button-row" style={{ margin: 0, display: 'inline-flex' }}>
                <button onClick={() => handleDecide(a.id, 'APPROVED')}>Approve</button>
                <button className="secondary" onClick={() => handleDecide(a.id, 'REJECTED')}>
                  Reject
                </button>
              </span>
            ))}
          </>
        )}
      </td>
    </tr>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: employee, loading, error, refetch } = useEmployee(id!);
  const { data: departments } = useDepartments();
  const { data: teams } = useTeams();
  const updateEmployee = useUpdateEmployee();

  const { data: attendance, refetch: refetchAttendance } = useAttendance(id);
  const { data: shifts } = useShifts();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [shiftHours, setShiftHours] = useState('');
  const [clockMessage, setClockMessage] = useState<string | null>(null);

  const { data: policies, refetch: refetchPolicies } = useLeavePolicies();
  const createPolicy = useCreateLeavePolicy();
  const { data: leaveRequests, refetch: refetchLeave } = useLeaveRequests(id);
  const requestLeave = useRequestLeave();
  const [policyId, setPolicyId] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const { data: balance } = useLeaveBalance(id, policyId || undefined);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyType, setNewPolicyType] = useState<LeaveType>('ANNUAL');
  const [newPolicyDays, setNewPolicyDays] = useState('20');

  const { data: payrollProfile, refetch: refetchPayroll } = usePayrollProfile(id!);
  const setPayrollProfile = useSetPayrollProfile();
  const [baseSalary, setBaseSalary] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const { data: reviews, refetch: refetchReviews } = usePerformanceReviews(id!);
  const addReview = useAddPerformanceReview();
  const [reviewPeriod, setReviewPeriod] = useState('');
  const [reviewRating, setReviewRating] = useState('3');
  const [reviewFeedback, setReviewFeedback] = useState('');

  const { data: trainingRecords, refetch: refetchTraining } = useTrainingRecords(id!);
  const addTraining = useAddTrainingRecord();
  const [courseName, setCourseName] = useState('');
  const [certificationName, setCertificationName] = useState('');

  const { data: assets, refetch: refetchAssets } = useEmployeeAssets(id!);
  const assignAsset = useAssignAsset();
  const returnAsset = useReturnAsset();
  const [assetType, setAssetType] = useState('');
  const [assetDescription, setAssetDescription] = useState('');

  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !employee)
    return <div className="error-banner">{error ?? 'Employee not found.'}</div>;

  const department = departments?.find((d) => d.id === employee.departmentId);
  const team = teams?.find((t) => t.id === employee.teamId);
  const openAttendance = attendance?.find((a) => !a.clockOutAt);

  return (
    <div>
      <div className="page-header">
        <h2>
          {employee.jobTitle} <span className="pill">{employee.employmentStatus}</span>
        </h2>
        <Link to="/employees">
          <button className="secondary">Back to employees</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Employee # <strong>{employee.employeeNumber}</strong> ·{' '}
          {employee.employmentType.replace('_', ' ')}
          {department && <> · {department.name}</>}
          {team && <> / {team.name}</>}
        </p>
        <p>
          Hired {new Date(employee.hireDate).toLocaleDateString()}
          {employee.terminationDate && (
            <> · Terminated {new Date(employee.terminationDate).toLocaleDateString()}</>
          )}
        </p>
        {(employee.emergencyContactName || employee.emergencyContactPhone) && (
          <p className="empty-state" style={{ padding: 0 }}>
            Emergency contact: {employee.emergencyContactName} {employee.emergencyContactPhone}
          </p>
        )}
        <div className="button-row">
          {STATUS_OPTIONS.filter((s) => s !== employee.employmentStatus).map((s) => (
            <button
              key={s}
              className="secondary"
              onClick={() => run(() => updateEmployee(id!, { employmentStatus: s }).then(refetch))}
            >
              Mark {s.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Attendance</h3>
        <div className="button-row" style={{ marginTop: 0 }}>
          {openAttendance ? (
            <>
              <input
                type="number"
                placeholder="Shift hours (optional)"
                value={shiftHours}
                onChange={(e) => setShiftHours(e.target.value)}
                style={{ maxWidth: 160 }}
              />
              <button
                onClick={() =>
                  run(async () => {
                    const result = await clockOut(
                      openAttendance.id,
                      shiftHours ? Number(shiftHours) : undefined,
                    );
                    setClockMessage(
                      `Worked ${result.workedHours.toFixed(1)}h, overtime ${result.overtimeHours.toFixed(1)}h.`,
                    );
                    await refetchAttendance();
                  })
                }
              >
                Clock out
              </button>
            </>
          ) : (
            <button onClick={() => run(() => clockIn(id!).then(() => refetchAttendance()))}>
              Clock in
            </button>
          )}
        </div>
        {clockMessage && (
          <p className="empty-state" style={{ padding: 0 }}>
            {clockMessage}
          </p>
        )}
        {shifts && shifts.length > 0 && (
          <p className="empty-state" style={{ padding: 0, fontSize: 12 }}>
            Shifts: {shifts.map((s) => `${s.name} (${s.startTime}–${s.endTime})`).join(', ')}
          </p>
        )}
        {attendance && attendance.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Clock in</th>
                <th>Clock out</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.clockInAt).toLocaleString()}</td>
                  <td>{a.clockOutAt ? new Date(a.clockOutAt).toLocaleString() : 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Leave</h3>
        {policies && policies.length === 0 && (
          <p className="empty-state">No leave policies yet — create one below.</p>
        )}
        <form
          className="line-item-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!newPolicyName.trim()) return;
            run(() =>
              createPolicy({
                type: newPolicyType,
                name: newPolicyName.trim(),
                daysPerYear: Number(newPolicyDays),
              }).then(() => {
                setNewPolicyName('');
                return refetchPolicies();
              }),
            );
          }}
        >
          <select
            value={newPolicyType}
            onChange={(e) => setNewPolicyType(e.target.value as LeaveType)}
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Policy name"
            value={newPolicyName}
            onChange={(e) => setNewPolicyName(e.target.value)}
          />
          <input
            type="number"
            placeholder="Days/year"
            value={newPolicyDays}
            onChange={(e) => setNewPolicyDays(e.target.value)}
          />
          <button type="submit">Add policy</button>
        </form>

        {policies && policies.length > 0 && (
          <>
            <div className="field">
              <label htmlFor="policy">Policy</label>
              <select id="policy" value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                <option value="">Select a policy</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.daysPerYear} days/year)
                  </option>
                ))}
              </select>
            </div>
            {policyId && balance && (
              <p>
                Remaining balance: <strong>{balance.balance}</strong> days
              </p>
            )}
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!policyId || !leaveStart || !leaveEnd) return;
                run(() =>
                  requestLeave({
                    employeeId: id!,
                    policyId,
                    startDate: new Date(leaveStart).toISOString(),
                    endDate: new Date(leaveEnd).toISOString(),
                    reason: leaveReason || undefined,
                  }).then(() => {
                    setLeaveStart('');
                    setLeaveEnd('');
                    setLeaveReason('');
                    return refetchLeave();
                  }),
                );
              }}
              className="line-item-row"
            >
              <input
                type="date"
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                required
              />
              <input
                type="date"
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                required
              />
              <input
                placeholder="Reason (optional)"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
              />
              <button type="submit">Request leave</button>
            </form>
          </>
        )}

        {leaveRequests && leaveRequests.length === 0 && (
          <p className="empty-state">No leave requests yet.</p>
        )}
        {leaveRequests && leaveRequests.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.map((r) => (
                <LeaveRequestRow key={r.id} request={r} onDecided={refetchLeave} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Payroll (architecture ready)</h3>
        {payrollProfile ? (
          <p>
            {payrollProfile.baseSalary} {payrollProfile.currency} · effective{' '}
            {new Date(payrollProfile.effectiveFrom).toLocaleDateString()}
          </p>
        ) : (
          <p className="empty-state">No payroll profile set.</p>
        )}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!baseSalary || !effectiveFrom) return;
            run(() =>
              setPayrollProfile({
                employeeId: id!,
                baseSalary: Number(baseSalary),
                currency,
                effectiveFrom: new Date(effectiveFrom).toISOString(),
              }).then(() => refetchPayroll()),
            );
          }}
          className="line-item-row"
        >
          <input
            type="number"
            placeholder="Base salary"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
          />
          <input
            placeholder="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={{ maxWidth: 80 }}
          />
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          <button type="submit">Set profile</button>
        </form>
      </div>

      <div className="card">
        <h3>Performance reviews</h3>
        {reviews && reviews.length === 0 && <p className="empty-state">No reviews yet.</p>}
        {reviews?.map((r) => (
          <p key={r.id}>
            <strong>{r.period}</strong>
            {r.rating != null && <> · rating {r.rating}/5</>}
            {r.feedback && <> — {r.feedback}</>}
          </p>
        ))}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!reviewPeriod.trim()) return;
            run(() =>
              addReview({
                employeeId: id!,
                period: reviewPeriod.trim(),
                rating: Number(reviewRating),
                feedback: reviewFeedback || undefined,
              }).then(() => {
                setReviewPeriod('');
                setReviewFeedback('');
                return refetchReviews();
              }),
            );
          }}
          className="line-item-row"
        >
          <input
            placeholder="Period (e.g. 2026-H1)"
            value={reviewPeriod}
            onChange={(e) => setReviewPeriod(e.target.value)}
          />
          <select value={reviewRating} onChange={(e) => setReviewRating(e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            placeholder="Feedback (optional)"
            value={reviewFeedback}
            onChange={(e) => setReviewFeedback(e.target.value)}
          />
          <button type="submit">Add review</button>
        </form>
      </div>

      <div className="card">
        <h3>Training &amp; certifications</h3>
        {trainingRecords && trainingRecords.length === 0 && (
          <p className="empty-state">No training records yet.</p>
        )}
        {trainingRecords?.map((t) => (
          <p key={t.id}>
            <strong>{t.courseName}</strong>
            {t.certificationName && <> — {t.certificationName}</>}
            {t.expiresAt && <> (expires {new Date(t.expiresAt).toLocaleDateString()})</>}
          </p>
        ))}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!courseName.trim()) return;
            run(() =>
              addTraining({
                employeeId: id!,
                courseName: courseName.trim(),
                certificationName: certificationName || undefined,
              }).then(() => {
                setCourseName('');
                setCertificationName('');
                return refetchTraining();
              }),
            );
          }}
          className="line-item-row"
        >
          <input
            placeholder="Course name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />
          <input
            placeholder="Certification (optional)"
            value={certificationName}
            onChange={(e) => setCertificationName(e.target.value)}
          />
          <button type="submit">Add record</button>
        </form>
      </div>

      <div className="card">
        <h3>Assets</h3>
        {assets && assets.length === 0 && <p className="empty-state">No assets assigned.</p>}
        {assets?.map((a) => (
          <p key={a.id}>
            <span className="pill">{a.returnedAt ? 'RETURNED' : 'ASSIGNED'}</span> {a.assetType}
            {a.description && ` — ${a.description}`}
            {!a.returnedAt && (
              <button
                className="secondary"
                style={{ marginLeft: 8 }}
                onClick={() => run(() => returnAsset(a.id).then(() => refetchAssets()))}
              >
                Return
              </button>
            )}
          </p>
        ))}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!assetType.trim()) return;
            run(() =>
              assignAsset({
                employeeId: id!,
                assetType: assetType.trim(),
                description: assetDescription || undefined,
              }).then(() => {
                setAssetType('');
                setAssetDescription('');
                return refetchAssets();
              }),
            );
          }}
          className="line-item-row"
        >
          <input
            placeholder="Asset type (e.g. Laptop)"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
          />
          <input
            placeholder="Description (optional)"
            value={assetDescription}
            onChange={(e) => setAssetDescription(e.target.value)}
          />
          <button type="submit">Assign asset</button>
        </form>
      </div>
    </div>
  );
}
