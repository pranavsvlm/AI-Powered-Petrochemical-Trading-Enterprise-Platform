import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { TemplateRenderer } from './template-renderer';
import type { ChannelAdapterRegistry } from '../infrastructure/channel-adapters';

export interface SendNotificationInput {
  companyId: string;
  recipientUserId: string;
  recipientEmail?: string;
  title: string;
  body: string;
  category: string;
  priority?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'INFORMATIONAL';
  channels?: Array<'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS' | 'PUSH'>;
  data?: Record<string, unknown>;
  templateCode?: string;
}

/**
 * Creates a Notification row (source of truth, drives GET /notifications and read-tracking)
 * and dispatches to each requested channel via the ChannelAdapterRegistry, recording a
 * NotificationDelivery row per channel with real status transitions.
 */
export class NotificationService {
  constructor(
    private readonly registry: ChannelAdapterRegistry,
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
  ) {}

  async send(input: SendNotificationInput) {
    let title = input.title;
    let body = input.body;

    if (input.templateCode) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { code: input.templateCode, companyId: input.companyId },
      });
      if (template) {
        title = template.subject
          ? TemplateRenderer.render(template.subject, input.data ?? {})
          : title;
        body = TemplateRenderer.render(template.body, input.data ?? {});
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        title,
        body,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
        data: input.data as object | undefined,
      },
    });

    const channels = input.channels ?? ['EMAIL', 'IN_APP'];
    for (const channel of channels) {
      const delivery = await this.prisma.notificationDelivery.create({
        data: { notificationId: notification.id, channel, status: 'PENDING', attempts: 1 },
      });
      try {
        await this.registry.get(channel).send({
          recipientUserId: input.recipientUserId,
          recipientEmail: input.recipientEmail,
          subject: title,
          body,
        });
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date(), deliveredAt: new Date() },
        });
        await this.audit(notification.id, 'SENT', { channel });
      } catch (err) {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', lastError: err instanceof Error ? err.message : String(err) },
        });
        await this.audit(notification.id, 'FAILED', { channel, error: String(err) });
      }
    }

    await this.audit(notification.id, 'CREATED', { category: input.category });
    return notification;
  }

  async markRead(notificationId: string) {
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    await this.audit(notificationId, 'READ', {});
    return updated;
  }

  async list(recipientUserId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { recipientUserId, readAt: unreadOnly ? null : undefined },
      orderBy: { createdAt: 'desc' },
    });
  }

  async history(companyId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { companyId },
      include: { deliveries: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async audit(notificationId: string, action: string, detail: Record<string, unknown>) {
    await this.prisma.notificationAudit.create({
      data: { notificationId, action, detail: detail as object },
    });
  }
}
