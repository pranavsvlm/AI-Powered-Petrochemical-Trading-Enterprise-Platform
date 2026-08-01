import type { AuditEventType } from '@platform/core';

/** Same shape every module's audit writer port uses — satisfied by AuditService at the composition root. */
export interface HrAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

/** Published by @modules/users, satisfied by UserService.getDepartmentById — never a direct import. */
export interface DepartmentLookupPort {
  getById(id: string): Promise<{ id: string } | null>;
}

/** Published by @modules/users, satisfied by UserService.getTeamById — never a direct import. */
export interface TeamLookupPort {
  getById(id: string): Promise<{ id: string } | null>;
}

/** Narrow slice of RuleEvaluationService's public API — same shape every prior module's local port uses. */
export interface ApprovalEvaluator {
  evaluateApproval(
    companyId: string,
    module: string,
    attributes: Record<string, unknown>,
  ): Promise<{
    approvers: Array<{ ruleId: string; [key: string]: unknown }>;
    matchedRuleIds: string[];
  }>;
}
