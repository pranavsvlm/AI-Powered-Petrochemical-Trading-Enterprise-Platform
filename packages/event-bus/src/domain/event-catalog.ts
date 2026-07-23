/**
 * Typed constants for event names published across the platform. Phase 2 introduced these as
 * documentation-only placeholders (doc 28) before any business module existed to publish
 * them; Phase 4's Customer/Product/Rfq/Quotation/Order services are the first real publishers
 * of the CUSTOMER/ORDER/RFQ family below — see docs/DOMAIN_MODEL_PHASE4.md. INVOICE_GENERATED
 * remains documentation-only (Finance is Phase 5) — do not subscribe to it expecting traffic.
 */
export const EVENT_TYPES = {
  // Platform-backbone-internal events, real in Phase 2:
  TASK_GENERATION_REQUESTED: 'TaskGenerationRequested',
  WORKFLOW_APPROVAL_REQUESTED: 'WorkflowApprovalRequested',
  WORKFLOW_EXECUTION_COMPLETED: 'WorkflowExecutionCompleted',
  WORKFLOW_EXECUTION_FAILED: 'WorkflowExecutionFailed',
  RULE_EXECUTED: 'RuleExecuted',
  // Core Trading Domain events, real in Phase 4:
  CUSTOMER_CREATED: 'CustomerCreated',
  CUSTOMER_UPDATED: 'CustomerUpdated',
  PRODUCT_CREATED: 'ProductCreated',
  PRODUCT_PRICE_CHANGED: 'ProductPriceChanged',
  // Fired when an RFQ is formally logged (whether drafted internally or received externally
  // — doc 13 draws no distinction), i.e. RfqService.submit().
  RFQ_RECEIVED: 'RFQReceived',
  QUOTATION_GENERATED: 'QuotationGenerated',
  QUOTATION_SENT: 'QuotationSent',
  QUOTATION_APPROVED: 'QuotationApproved',
  QUOTATION_REJECTED: 'QuotationRejected',
  ORDER_CREATED: 'OrderCreated',
  ORDER_STATUS_CHANGED: 'OrderStatusChanged',
  // Example business-module event name (doc 28) — documentation only, no publisher exists
  // yet; Finance is Phase 5. Do not subscribe to this expecting real traffic.
  INVOICE_GENERATED: 'InvoiceGenerated',
} as const;

export type EventTypeName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
