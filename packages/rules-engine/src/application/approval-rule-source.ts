import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { RuleWithMeta } from './rule-conflict-resolver';

/**
 * docs/DOMAIN_MODEL_PHASE2.md §3: the Rules Engine is the canonical evaluator for
 * approval-type decisions; Phase-1's ApprovalRule table becomes one read source among
 * possibly several (the other being natively-authored Rule/RuleVersion rows whose action
 * type is REQUEST_APPROVAL). Both sources are merged by RuleEvaluationService.
 */
export interface ApprovalRuleSource {
  loadApplicable(companyId: string, module: string): Promise<RuleWithMeta[]>;
}

/**
 * Reads Phase-1's ApprovalRule table (still owned/written by Roles & Permissions' CRUD,
 * untouched) and adapts each row into the Rules Engine's RuleWithMeta shape. Read-only —
 * this source never writes back to approval_rules.
 */
export class LegacyApprovalRuleSource implements ApprovalRuleSource {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async loadApplicable(companyId: string, module: string): Promise<RuleWithMeta[]> {
    const rows = await this.prisma.approvalRule.findMany({ where: { companyId } });
    return rows.map((row) => ({
      ruleId: `legacy-approval:${row.id}`,
      companyId: row.companyId,
      module,
      priority: 0,
      condition: row.triggerCondition as never,
      actions: [
        {
          type: 'REQUEST_APPROVAL',
          params: {
            approverRoleId: row.approverRoleId,
            threshold: row.threshold,
            source: 'legacy',
          },
        },
      ],
      updatedAt: row.updatedAt,
    }));
  }
}

/** Natively-authored rules whose action includes REQUEST_APPROVAL, loaded via RuleRepository. */
export class NativeRuleSource implements ApprovalRuleSource {
  constructor(
    private readonly loadRules: (companyId: string, module: string) => Promise<RuleWithMeta[]>,
  ) {}

  async loadApplicable(companyId: string, module: string): Promise<RuleWithMeta[]> {
    const rules = await this.loadRules(companyId, module);
    return rules.filter((r) => r.actions.some((a) => a.type === 'REQUEST_APPROVAL'));
  }
}
