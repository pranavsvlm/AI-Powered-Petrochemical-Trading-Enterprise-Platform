import type {
  TenantScopedPrismaClient,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  LeaveRequestStatus,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

export interface CreateLeavePolicyInput {
  companyId: string;
  type: LeaveType;
  name: string;
  daysPerYear: number;
}

export interface CreateLeaveRequestInput {
  companyId: string;
  employeeId: string;
  policyId: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export class LeavePolicyRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateLeavePolicyInput): Promise<LeavePolicy> {
    return this.db.leavePolicy.create({ data: input });
  }

  list(companyId: string): Promise<LeavePolicy[]> {
    return this.db.leavePolicy.findMany({ where: { companyId } });
  }

  findById(id: string): Promise<LeavePolicy | null> {
    return this.db.leavePolicy.findUnique({ where: { id } });
  }
}

export class LeaveRequestRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    return this.db.leaveRequest.create({ data: input });
  }

  updateStatus(id: string, status: LeaveRequestStatus, decidedAt?: Date): Promise<LeaveRequest> {
    return this.db.leaveRequest.update({ where: { id }, data: { status, decidedAt } });
  }

  findById(id: string): Promise<LeaveRequest | null> {
    return this.db.leaveRequest.findUnique({ where: { id } });
  }

  list(companyId: string, employeeId?: string): Promise<LeaveRequest[]> {
    return this.db.leaveRequest.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Approved requests for this employee's policy within the current calendar year — the real
   * basis `domain/leave-balance.ts`'s computeLeaveBalance reduces over. */
  listApprovedThisYear(
    employeeId: string,
    policyId: string,
    yearStart: Date,
    yearEnd: Date,
  ): Promise<LeaveRequest[]> {
    return this.db.leaveRequest.findMany({
      where: {
        employeeId,
        policyId,
        status: 'APPROVED',
        startDate: { gte: yearStart, lte: yearEnd },
      },
    });
  }

  /** Reuses the platform's existing generic ApprovalRequest table — same as
   * Quotations/Documents, never a new approval mechanism. */
  createApproval(input: {
    companyId: string;
    leaveRequestId: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.db.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'LeaveRequest',
        entityId: input.leaveRequestId,
        approverUserId: input.approverUserId,
        approverRoleId: input.approverRoleId,
      },
    });
  }

  findApproval(id: string): Promise<ApprovalRequest | null> {
    return this.db.approvalRequest.findUnique({ where: { id } });
  }

  findPendingApprovals(leaveRequestId: string): Promise<ApprovalRequest[]> {
    return this.db.approvalRequest.findMany({
      where: { entityType: 'LeaveRequest', entityId: leaveRequestId, status: 'PENDING' },
    });
  }

  decideApproval(id: string, decision: ApprovalStatus, comment?: string): Promise<ApprovalRequest> {
    return this.db.approvalRequest.update({
      where: { id },
      data: { status: decision, decidedAt: new Date(), comment },
    });
  }
}
