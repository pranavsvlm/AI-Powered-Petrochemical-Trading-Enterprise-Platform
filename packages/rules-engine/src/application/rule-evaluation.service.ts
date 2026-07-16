import { evaluateCondition, type ConditionNode } from '@platform/permissions';
import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { RuleRepository } from '../infrastructure/rule.repository';
import { RuleConflictResolver, type RuleWithMeta } from './rule-conflict-resolver';
import { RuleActionExecutor } from './rule-action-executor';
import type { ApprovalRuleSource } from './approval-rule-source';
import type { RuleEvaluationContext, RuleEvaluationDecision } from '../domain/rule-types';

/**
 * The rule evaluation pipeline: trigger -> load applicable rules (company + effective-date
 * scoped) -> evaluate conditions -> resolve priority/conflicts -> execute actions -> return
 * decision. Deterministic and testable without any AI dependency (CALL_AI is the only
 * action that can throw NotImplementedInPhaseError, and only if a rule actually uses it).
 */
export class RuleEvaluationService {
  constructor(
    private readonly repository: RuleRepository,
    private readonly actionExecutor: RuleActionExecutor,
    private readonly approvalSources: ApprovalRuleSource[] = [],
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
  ) {}

  async evaluate(
    context: RuleEvaluationContext,
    isSimulation = false,
  ): Promise<RuleEvaluationDecision> {
    const start = Date.now();
    const applicable = await this.repository.loadApplicable(
      context.companyId,
      context.module,
      context.timestamp,
    );
    const sorted = RuleConflictResolver.sort(applicable);

    const matched = sorted.filter((rule) => {
      try {
        return evaluateCondition(rule.condition, context.attributes as never);
      } catch {
        return false;
      }
    });

    const plan = RuleConflictResolver.resolveActionPlan(matched);
    const actionsPerformed = [];
    for (const { ruleId, action } of plan) {
      actionsPerformed.push(
        await this.actionExecutor.execute(ruleId, action, context, isSimulation),
      );
    }

    const decision = this.deriveDecision(plan.map((p) => p.action.type));
    const durationMs = Date.now() - start;

    if (!isSimulation && matched.length > 0) {
      for (const rule of new Set(matched.map((m) => m.ruleId))) {
        if (rule.startsWith('legacy-approval:')) continue;
        await this.prisma.ruleExecution.create({
          data: {
            ruleId: rule,
            companyId: context.companyId,
            triggerContext: context.attributes as object,
            decision,
            actionsPerformed: actionsPerformed as unknown as object,
            durationMs,
            isSimulation,
          },
        });
      }
    }

    return { decision, matchedRules: matched.map((m) => m.ruleId), actionsPerformed, durationMs };
  }

  /** Resolves the approver chain for an approval-type trigger — called by workflow's APPROVAL node. */
  async evaluateApproval(companyId: string, module: string, attributes: Record<string, unknown>) {
    const candidates: RuleWithMeta[] = [];
    for (const source of this.approvalSources) {
      candidates.push(...(await source.loadApplicable(companyId, module)));
    }
    const sorted = RuleConflictResolver.sort(candidates);
    const matched = sorted.filter((rule) => {
      try {
        return evaluateCondition(rule.condition as ConditionNode, attributes as never);
      } catch {
        return false;
      }
    });
    const approvalActions = matched.flatMap((r) =>
      r.actions
        .filter((a) => a.type === 'REQUEST_APPROVAL')
        .map((a) => ({ ruleId: r.ruleId, ...a.params })),
    );
    return { approvers: approvalActions, matchedRuleIds: matched.map((m) => m.ruleId) };
  }

  private deriveDecision(actionTypes: string[]): RuleEvaluationDecision['decision'] {
    if (actionTypes.includes('BLOCK')) return 'BLOCK';
    if (actionTypes.includes('WARN')) return 'WARN';
    if (actionTypes.includes('ALLOW')) return 'ALLOW';
    return actionTypes.length > 0 ? 'ALLOW' : 'NO_MATCH';
  }
}
