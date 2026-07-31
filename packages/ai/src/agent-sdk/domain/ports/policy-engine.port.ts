/**
 * Narrow slice of RuleEvaluationService's public API — satisfied by
 * RuleEvaluationService.evaluateApproval directly, never reimplemented. Same shape as
 * modules/document-management's ApprovalEvaluator port. The agent orchestrator calls this
 * with module `'ai'` to ask "does an AI-initiated call to this tool need a human before it
 * fires", a gate complementary to (not a replacement for) `Tool.requiresHumanApproval` and any
 * approval gate the tool's own underlying module method already enforces internally.
 */
export interface ApprovalEvaluator {
  evaluateApproval(
    companyId: string,
    module: string,
    attributes: Record<string, unknown>,
  ): Promise<{
    approvers: Array<{
      ruleId: string;
      approverUserId?: unknown;
      approverRoleId?: unknown;
      [key: string]: unknown;
    }>;
    matchedRuleIds: string[];
  }>;
}
