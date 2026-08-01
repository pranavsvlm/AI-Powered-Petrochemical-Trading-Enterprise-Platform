/**
 * Typed payload shapes for events that have both a real publisher and a real consumer in
 * different `packages/*`/`modules/*` packages — living here (rather than next to either side)
 * is what lets both import the same type without either depending on the other, respecting the
 * `packages/*` must never depend on `modules/*` rule (see docs/DOMAIN_MODEL_PHASE6.md §9).
 * Events with only one real side so far keep a locally-defined payload type there instead (e.g.
 * `WorkflowApprovalRequestedPayload` in `packages/notifications`) — this file is only for the
 * shared case.
 */

/**
 * `EVENT_TYPES.TASK_GENERATION_REQUESTED` — published by `packages/rules-engine`'s
 * `GENERATE_TASK` rule action, consumed by `modules/tasks`. Note: `docs/DOMAIN_MODEL_PHASE2.md`
 * §5 documents an `executionId` field that the real publish call never actually included — this
 * type matches the real, live payload shape, not the doc.
 */
export interface TaskGenerationRequestedPayload {
  ruleId: string;
  companyId: string;
  assigneeUserId?: string;
  assigneeTeamId?: string;
  title: string;
  description?: string;
  dueDate?: string;
  sourceModule: string;
  sourceEntityId?: string;
}
