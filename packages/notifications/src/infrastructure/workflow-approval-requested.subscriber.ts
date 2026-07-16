import { EVENT_TYPES, type RedisStreamsEventBus } from '@platform/event-bus';
import type { NotificationService } from '../application/notification.service';

interface WorkflowApprovalRequestedPayload {
  approverUserId: string;
  approverEmail?: string;
  workflowName: string;
  executionId: string;
}

/**
 * Demonstrates the required "other modules trigger notifications by publishing events, not
 * direct calls" wiring (spec module 4): subscribes to WorkflowApprovalRequested and sends
 * an in-app + email notification to the approver. Registered once at app bootstrap.
 */
export async function registerWorkflowApprovalRequestedSubscriber(
  eventBus: RedisStreamsEventBus,
  notificationService: NotificationService,
): Promise<() => Promise<void>> {
  return eventBus.subscribe<WorkflowApprovalRequestedPayload>(
    EVENT_TYPES.WORKFLOW_APPROVAL_REQUESTED,
    'notifications:workflow-approval',
    async (envelope) => {
      const payload = envelope.payload;
      await notificationService.send({
        companyId: envelope.companyId,
        recipientUserId: payload.approverUserId,
        recipientEmail: payload.approverEmail,
        title: `Approval requested: ${payload.workflowName}`,
        body: `Your approval is requested for workflow execution ${payload.executionId}.`,
        category: 'APPROVAL_PENDING',
        priority: 'HIGH',
        channels: ['EMAIL', 'IN_APP'],
        data: { executionId: payload.executionId },
      });
    },
  );
}
