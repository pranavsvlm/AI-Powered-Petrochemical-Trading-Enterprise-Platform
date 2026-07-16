/**
 * Documentation-only typed constants for example event names from doc 28 and the business
 * modules that will eventually publish them. No handlers exist for these in Phase 2 — they
 * exist so Phase 2 infrastructure code (rules-engine "Generate Task" action, notifications'
 * example wiring) can reference a stable, typed name instead of a magic string, without
 * implying the emitting business module exists yet.
 */
export const EVENT_TYPES = {
  // Platform-backbone-internal events, real in Phase 2:
  TASK_GENERATION_REQUESTED: 'TaskGenerationRequested',
  WORKFLOW_APPROVAL_REQUESTED: 'WorkflowApprovalRequested',
  WORKFLOW_EXECUTION_COMPLETED: 'WorkflowExecutionCompleted',
  WORKFLOW_EXECUTION_FAILED: 'WorkflowExecutionFailed',
  RULE_EXECUTED: 'RuleExecuted',
  // Example business-module event names (doc 28) — documentation only, no publisher exists
  // in Phase 2; do not subscribe to these expecting real traffic yet.
  CUSTOMER_CREATED: 'CustomerCreated',
  ORDER_CREATED: 'OrderCreated',
  RFQ_RECEIVED: 'RFQReceived',
  INVOICE_GENERATED: 'InvoiceGenerated',
} as const;

export type EventTypeName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
