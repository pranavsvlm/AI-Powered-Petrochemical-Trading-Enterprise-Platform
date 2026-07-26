/**
 * Typed constants for event names published across the platform. Phase 2 introduced these as
 * documentation-only placeholders (doc 28) before any business module existed to publish
 * them; Phase 4's Customer/Product/Rfq/Quotation/Order services are the first real publishers
 * of the CUSTOMER/ORDER/RFQ family below — see docs/DOMAIN_MODEL_PHASE4.md. Phase 5's
 * Inventory/Procurement/Accounting services are the first real publishers of the
 * INVENTORY/GOODS_RECEIVED/PURCHASE_ORDER/SUPPLIER_BILL/JOURNAL family and of
 * INVOICE_GENERATED — see docs/DOMAIN_MODEL_PHASE5.md.
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
  // Inventory, Procurement & Finance events, real in Phase 5:
  INVENTORY_RESERVED: 'InventoryReserved',
  INVENTORY_COMMITTED: 'InventoryCommitted',
  GOODS_RECEIVED: 'GoodsReceived',
  PURCHASE_ORDER_CREATED: 'PurchaseOrderCreated',
  PURCHASE_ORDER_APPROVED: 'PurchaseOrderApproved',
  SUPPLIER_BILL_CREATED: 'SupplierBillCreated',
  JOURNAL_POSTED: 'JournalPosted',
  INVOICE_GENERATED: 'InvoiceGenerated',
} as const;

export type EventTypeName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
