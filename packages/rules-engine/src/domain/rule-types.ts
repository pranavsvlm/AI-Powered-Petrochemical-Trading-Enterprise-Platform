import type { ConditionNode } from '@platform/permissions';

export type RuleActionType =
  | 'ALLOW'
  | 'BLOCK'
  | 'WARN'
  | 'REQUEST_APPROVAL'
  | 'NOTIFY'
  | 'GENERATE_TASK'
  | 'EXECUTE_WORKFLOW'
  | 'CALL_AI'
  | 'CALL_API';

export interface RuleActionDef {
  type: RuleActionType;
  params: Record<string, unknown>;
  order?: number;
  /** If true and this action's rule wins, no lower-priority rule's actions execute. */
  terminal?: boolean;
}

export interface RuleDefinition {
  ruleId: string;
  companyId: string;
  module: string;
  priority: number;
  condition: ConditionNode;
  actions: RuleActionDef[];
}

export interface RuleEvaluationContext {
  module: string;
  companyId: string;
  attributes: Record<string, unknown>;
  timestamp?: Date;
}

export interface ActionExecutionResult {
  type: RuleActionType;
  ruleId: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface RuleEvaluationDecision {
  decision: 'ALLOW' | 'BLOCK' | 'WARN' | 'NO_MATCH';
  matchedRules: string[];
  actionsPerformed: ActionExecutionResult[];
  durationMs: number;
}
