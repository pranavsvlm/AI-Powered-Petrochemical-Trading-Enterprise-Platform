import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { NotificationService } from './notification.service';

/**
 * Real scheduled check (not just schema): finds WorkflowApproval-shaped "Approval Pending"
 * notifications (category=APPROVAL_PENDING) older than the threshold with no read receipt
 * and escalates to the configured manager. apps/backend wires this to a cron/interval;
 * the check itself is pure and callable directly from a test.
 */
export class EscalationCheckerService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
  ) {}

  async runOnce(thresholdHours = 24): Promise<{ escalated: number }> {
    const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const stale = await this.prisma.notification.findMany({
      where: { category: 'APPROVAL_PENDING', readAt: null, createdAt: { lte: cutoff } },
    });

    let escalated = 0;
    for (const notification of stale) {
      const data = (notification.data ?? {}) as Record<string, unknown>;
      const managerUserId = data.managerUserId as string | undefined;
      if (!managerUserId) continue;

      await this.notificationService.send({
        companyId: notification.companyId,
        recipientUserId: managerUserId,
        title: `Escalation: ${notification.title}`,
        body: `Approval "${notification.title}" has been pending for over ${thresholdHours}h without action.`,
        category: 'APPROVAL_ESCALATION',
        priority: 'HIGH',
        channels: ['EMAIL', 'IN_APP'],
        data: { originalNotificationId: notification.id },
      });
      escalated += 1;
    }
    return { escalated };
  }
}
