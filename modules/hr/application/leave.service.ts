import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, LeavePolicy, LeaveRequest } from '@platform/database';
import { computeLeaveBalance } from '../domain/leave-balance';
import {
  LeavePolicyRepository,
  LeaveRequestRepository,
  type CreateLeavePolicyInput,
  type CreateLeaveRequestInput,
} from '../infrastructure/leave.repository';
import type { ApprovalEvaluator, HrAuditWriter } from './ports';

function yearBounds(date: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), 0, 1)),
    end: new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59)),
  };
}

/**
 * Leave (doc 15) — approval is delegated entirely to the Rules Engine and the platform's
 * existing generic `ApprovalRequest` table, the exact shape `QuotationService.requestApproval`/
 * `.decideApproval` already established. Never a new approval mechanism. Leave balance is
 * always computed fresh from real approved requests (`domain/leave-balance.ts`), never a stored
 * counter that can drift out of sync.
 */
@Injectable()
export class LeaveService {
  private readonly policies: LeavePolicyRepository;
  private readonly requests: LeaveRequestRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly audit: HrAuditWriter,
  ) {
    this.policies = new LeavePolicyRepository(db);
    this.requests = new LeaveRequestRepository(db);
  }

  createPolicy(input: CreateLeavePolicyInput): Promise<LeavePolicy> {
    return this.policies.create(input);
  }

  listPolicies(companyId: string): Promise<LeavePolicy[]> {
    return this.policies.list(companyId);
  }

  async requestLeave(
    input: CreateLeaveRequestInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<LeaveRequest> {
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    const request = await this.requests.create(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.LEAVE_REQUESTED,
      entityType: 'LeaveRequest',
      entityId: request.id,
      after: { policyId: input.policyId, startDate: input.startDate, endDate: input.endDate },
      ipAddress: ipAddress ?? null,
    });

    const { approvers } = await this.approvalEvaluator.evaluateApproval(input.companyId, 'hr', {
      leaveRequestId: request.id,
      employeeId: input.employeeId,
      days:
        Math.round((input.endDate.getTime() - input.startDate.getTime()) / (24 * 60 * 60 * 1000)) +
        1,
    });

    if (approvers.length === 0) {
      return this.finalizeDecision(request, 'APPROVED', actorUserId, ipAddress);
    }

    await Promise.all(
      approvers.map((a) =>
        this.requests.createApproval({
          companyId: input.companyId,
          leaveRequestId: request.id,
          approverUserId: a.approverUserId as string | undefined,
          approverRoleId: a.approverRoleId as string | undefined,
        }),
      ),
    );
    return request;
  }

  async decide(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    comment?: string,
    ipAddress?: string | null,
  ): Promise<LeaveRequest> {
    const approval = await this.requests.findApproval(approvalId);
    if (!approval) throw new NotFoundException('Approval not found.');
    await this.requests.decideApproval(approvalId, decision, comment);

    const request = await this.getById(approval.entityId);
    return this.finalizeDecision(request, decision, actorUserId, ipAddress);
  }

  private async finalizeDecision(
    request: LeaveRequest,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<LeaveRequest> {
    const updated = await this.requests.updateStatus(request.id, decision, new Date());
    await this.audit.record({
      companyId: request.companyId,
      actorUserId,
      eventType:
        decision === 'APPROVED' ? AuditEventType.LEAVE_APPROVED : AuditEventType.LEAVE_REJECTED,
      entityType: 'LeaveRequest',
      entityId: request.id,
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async getById(id: string): Promise<LeaveRequest> {
    const request = await this.requests.findById(id);
    if (!request) throw new NotFoundException('Leave request not found.');
    return request;
  }

  list(companyId: string, employeeId?: string): Promise<LeaveRequest[]> {
    return this.requests.list(companyId, employeeId);
  }

  listPendingApprovals(leaveRequestId: string) {
    return this.requests.findPendingApprovals(leaveRequestId);
  }

  async getBalance(employeeId: string, policyId: string, asOf: Date = new Date()): Promise<number> {
    const policy = await this.policies.findById(policyId);
    if (!policy) throw new NotFoundException('Leave policy not found.');
    const { start, end } = yearBounds(asOf);
    const approved = await this.requests.listApprovedThisYear(employeeId, policyId, start, end);
    return computeLeaveBalance(
      policy.daysPerYear,
      approved.map((r) => ({ startDate: r.startDate, endDate: r.endDate })),
    );
  }
}
