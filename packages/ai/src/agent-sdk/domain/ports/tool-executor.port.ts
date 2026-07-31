export interface ToolExecutionContext {
  companyId: string;
  userId: string;
}

/**
 * Executes a tool's real underlying action. The Agent SDK never imports another module's
 * Repository or Service directly — apps/backend/src/modules/ai/ai.module.ts binds each
 * `Tool.key` to a closure over the owning module's own published method (the exact same
 * "narrow port satisfied by a closure" pattern OrderService's QuotationLookupPort etc. use).
 * Tool-binding constraint: only methods that own their COMPLETE transaction boundary
 * internally may be bound — see docs/DOMAIN_MODEL_PHASE6.md §12.
 */
export interface ToolExecutor {
  execute(
    toolKey: string,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<unknown>;
}
