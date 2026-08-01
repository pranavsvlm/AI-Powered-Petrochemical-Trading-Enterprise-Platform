export { EmployeeService } from '../application/employee.service';
export { AttendanceService } from '../application/attendance.service';
export type { ClockOutResult } from '../application/attendance.service';
export { LeaveService } from '../application/leave.service';
export { EmployeeRecordsService } from '../application/employee-records.service';

export type {
  HrAuditWriter,
  DepartmentLookupPort,
  TeamLookupPort,
  ApprovalEvaluator,
} from '../application/ports';

export { EmployeeRepository } from '../infrastructure/employee.repository';
export type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '../infrastructure/employee.repository';
export { ShiftRepository, AttendanceRepository } from '../infrastructure/attendance.repository';
export type { CreateShiftInput } from '../infrastructure/attendance.repository';
export { LeavePolicyRepository, LeaveRequestRepository } from '../infrastructure/leave.repository';
export type {
  CreateLeavePolicyInput,
  CreateLeaveRequestInput,
} from '../infrastructure/leave.repository';
export { EmployeeRecordsRepository } from '../infrastructure/employee-records.repository';
export type {
  UpsertPayrollProfileInput,
  CreatePerformanceReviewInput,
  CreateTrainingRecordInput,
  CreateEmployeeAssetInput,
} from '../infrastructure/employee-records.repository';

export { computeLeaveBalance, computeDaySpan } from '../domain/leave-balance';
export type { LeaveDaySpan } from '../domain/leave-balance';
export {
  computeWorkedHours,
  computeOvertimeHours,
  parseShiftHours,
  InvalidAttendanceRangeError,
} from '../domain/attendance-hours';
