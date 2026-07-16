export const PACKAGE_NAME = '@platform/rules-engine';

export type {
  RuleActionType,
  RuleActionDef,
  RuleDefinition,
  RuleEvaluationContext,
  ActionExecutionResult,
  RuleEvaluationDecision,
} from './domain/rule-types';

export { NotImplementedAiDecisionProvider } from './domain/ports/ai-decision-provider.port';
export type {
  AiDecisionProvider,
  AiDecisionContext,
  AiDecisionResult,
} from './domain/ports/ai-decision-provider.port';
export type {
  WorkflowClientPort,
  NotificationClientPort,
} from './domain/ports/rules-engine-clients.port';

export { RuleConflictResolver } from './application/rule-conflict-resolver';
export type { RuleWithMeta } from './application/rule-conflict-resolver';
export { RuleActionExecutor } from './application/rule-action-executor';
export type { RuleActionExecutorDeps } from './application/rule-action-executor';
export { RuleEvaluationService } from './application/rule-evaluation.service';
export { RuleManagementService } from './application/rule-management.service';
export type { CreateRuleInput } from './application/rule-management.service';
export { LegacyApprovalRuleSource, NativeRuleSource } from './application/approval-rule-source';
export type { ApprovalRuleSource } from './application/approval-rule-source';

export { RuleRepository } from './infrastructure/rule.repository';
