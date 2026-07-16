/**
 * Public-API ports the rules-engine calls out through, so it never reaches into workflow's
 * or notifications' internals (doc 03 module-boundary contract). Concrete implementations
 * are injected by apps/backend composition root, wired to the real workflow/notification
 * packages' public entry points.
 */
export interface WorkflowClientPort {
  startWorkflow(input: {
    workflowId: string;
    companyId: string;
    context: Record<string, unknown>;
  }): Promise<{ executionId: string }>;
}

export interface NotificationClientPort {
  notify(input: {
    companyId: string;
    recipientUserId: string;
    title: string;
    body: string;
    category: string;
    priority?: string;
  }): Promise<{ notificationId: string }>;
}
