import {
  EVENT_TYPES,
  type RedisStreamsEventBus,
  type TaskGenerationRequestedPayload,
} from '@platform/event-bus';
import { TenantContextStore } from '@platform/core';
import type { TaskService } from '../application/task.service';

/**
 * The real consumer of `TaskGenerationRequested` — published by `packages/rules-engine`'s
 * `GENERATE_TASK` rule action since Phase 2, with no consumer until now (see
 * docs/DOMAIN_MODEL_PHASE7.md §3). Registered once at worker bootstrap, same pattern as
 * `packages/notifications`' `registerWorkflowApprovalRequestedSubscriber`. Not scoped to a
 * single company (no `{ companyId }` filter) since this worker process serves every tenant —
 * tenant isolation for the actual write comes from binding `TenantContextStore` per event,
 * matching `WorkflowTriggerScheduler.runWorkflow`'s exact pattern.
 */
export async function registerTaskGenerationRequestedSubscriber(
  eventBus: RedisStreamsEventBus,
  taskService: TaskService,
): Promise<() => Promise<void>> {
  return eventBus.subscribe<TaskGenerationRequestedPayload>(
    EVENT_TYPES.TASK_GENERATION_REQUESTED,
    'tasks:generation',
    async (envelope) => {
      const payload = envelope.payload;
      await TenantContextStore.run(
        {
          companyId: payload.companyId,
          userId: null,
          sessionId: null,
          ipAddress: null,
          isPlatformActor: false,
        },
        async () => {
          await taskService.createFromEvent(payload);
        },
      );
    },
  );
}
