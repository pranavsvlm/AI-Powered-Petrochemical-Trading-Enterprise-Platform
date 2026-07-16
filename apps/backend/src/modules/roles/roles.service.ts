import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

// CRUD + query API for Role/Permission/Policy/ApprovalRule (doc 07). Data model and storage
// only - rule evaluation/execution is out of Phase 1 scope (Business Rules Engine, doc 23).
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createRole(
    companyId: string,
    name: string,
    description: string | undefined,
    actorUserId: string,
    ip: string | null,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { companyId, name, description, isSystemRole: false },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.PERMISSION_CHANGED,
          entityType: 'Role',
          entityId: role.id,
          after: { name },
          ipAddress: ip,
        },
        tx,
      );
      return role;
    });
  }

  listRoles() {
    return this.prisma.client.role.findMany();
  }

  async getRole(id: string) {
    const role = await this.prisma.client.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async updateRole(
    id: string,
    data: { name?: string; description?: string },
    actorUserId: string,
    ip: string | null,
  ) {
    const role = await this.prisma.client.role.update({ where: { id }, data });
    await this.audit.record({
      companyId: role.companyId,
      actorUserId,
      eventType: AuditEventType.PERMISSION_CHANGED,
      entityType: 'Role',
      entityId: id,
      after: data,
      ipAddress: ip,
    });
    return role;
  }

  listPermissions() {
    return this.prisma.client.permission.findMany();
  }

  async setRolePermissions(
    roleId: string,
    permissionIds: string[],
    actorUserId: string,
    companyId: string,
    ip: string | null,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.PERMISSION_CHANGED,
          entityType: 'Role',
          entityId: roleId,
          after: { permissionIds },
          ipAddress: ip,
        },
        tx,
      );
    });
    return this.getRole(roleId);
  }

  async assignRole(
    userId: string,
    roleId: string,
    actorUserId: string,
    companyId: string,
    ip: string | null,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId },
        update: {},
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.ROLE_ASSIGNED,
          entityType: 'User',
          entityId: userId,
          after: { roleId },
          ipAddress: ip,
        },
        tx,
      );
    });
  }

  // ── Policies ─────────────────────────────────────────────────────────
  createPolicy(
    companyId: string,
    name: string,
    definition: Record<string, unknown>,
    actorUserId: string,
    ip: string | null,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const policy = await tx.policy.create({ data: { companyId, name, definition } });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.POLICY_UPDATED,
          entityType: 'Policy',
          entityId: policy.id,
          after: { name },
          ipAddress: ip,
        },
        tx,
      );
      return policy;
    });
  }

  listPolicies() {
    return this.prisma.client.policy.findMany();
  }

  // ── Approval Rules ───────────────────────────────────────────────────
  createApprovalRule(
    companyId: string,
    name: string,
    triggerCondition: Record<string, unknown>,
    approverRoleId: string,
    threshold: Record<string, unknown> | undefined,
    actorUserId: string,
    ip: string | null,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const rule = await tx.approvalRule.create({
        data: { companyId, name, triggerCondition, approverRoleId, threshold },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.POLICY_UPDATED,
          entityType: 'ApprovalRule',
          entityId: rule.id,
          after: { name },
          ipAddress: ip,
        },
        tx,
      );
      return rule;
    });
  }

  listApprovalRules() {
    return this.prisma.client.approvalRule.findMany();
  }

  async decideApproval(
    approvalHistoryId: string,
    approvedById: string,
    approve: boolean,
    companyId: string,
    ip: string | null,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const history = await tx.approvalHistory.update({
        where: { id: approvalHistoryId },
        data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById, decidedAt: new Date() },
      });
      await this.audit.record(
        {
          companyId,
          actorUserId: approvedById,
          eventType: approve ? AuditEventType.APPROVAL_GRANTED : AuditEventType.APPROVAL_REJECTED,
          entityType: 'ApprovalHistory',
          entityId: approvalHistoryId,
          ipAddress: ip,
        },
        tx,
      );
      return history;
    });
  }
}
