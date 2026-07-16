/**
 * Integration test — requires live Postgres:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/navoasis \
 *   pnpm --filter @platform/notifications test:integration
 *
 * Covers: notification creation + real (console) email delivery + in-app delivery + read
 * tracking, and the escalation checker actually firing for a stale APPROVAL_PENDING
 * notification.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import { NotificationService } from '../application/notification.service';
import { EscalationCheckerService } from '../application/escalation-checker.service';
import { ChannelAdapterRegistry } from '../infrastructure/channel-adapters';
import { ConsoleEmailSenderAdapter } from '../infrastructure/console-email-sender.adapter';

const prisma = getPrismaClient();

function asTenant<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('Notification Center integration (live Postgres)', () => {
  const companyId = randomUUID();
  const recipientUserId = randomUUID();
  const registry = new ChannelAdapterRegistry(new ConsoleEmailSenderAdapter());
  const notificationService = new NotificationService(registry, prisma);
  const escalationChecker = new EscalationCheckerService(notificationService, prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sends a notification over EMAIL + IN_APP and records delivery per channel', async () => {
    const notification = await asTenant(companyId, () =>
      notificationService.send({
        companyId,
        recipientUserId,
        recipientEmail: 'test@example.com',
        title: 'Test Notification',
        body: 'Hello',
        category: 'TEST',
        channels: ['EMAIL', 'IN_APP'],
      }),
    );

    expect(notification.id).toBeTruthy();

    const deliveries = await asTenant(companyId, () =>
      prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } }),
    );
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.status === 'SENT')).toBe(true);
    expect(deliveries.map((d) => d.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
  }, 20000);

  it('rejects an unavailable channel (WHATSAPP) with a clear delivery failure, not a silent drop', async () => {
    const notification = await asTenant(companyId, () =>
      notificationService.send({
        companyId,
        recipientUserId,
        title: 'Unsupported channel test',
        body: 'x',
        category: 'TEST',
        channels: ['WHATSAPP'],
      }),
    );
    const deliveries = await asTenant(companyId, () =>
      prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } }),
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('FAILED');
    expect(deliveries[0]?.lastError).toMatch(/not yet available/i);
  }, 20000);

  it('marks a notification as read', async () => {
    const notification = await asTenant(companyId, () =>
      notificationService.send({
        companyId,
        recipientUserId,
        title: 'Read tracking test',
        body: 'x',
        category: 'TEST',
        channels: ['IN_APP'],
      }),
    );
    const updated = await asTenant(companyId, () => notificationService.markRead(notification.id));
    expect(updated.readAt).toBeTruthy();

    const unread = await asTenant(companyId, () => notificationService.list(recipientUserId, true));
    expect(unread.some((n) => n.id === notification.id)).toBe(false);
  }, 20000);

  it('escalation checker sends an escalation notification for a stale APPROVAL_PENDING notification', async () => {
    const managerUserId = randomUUID();

    // Simulate a notification created 25 hours ago (past the 24h threshold) with no read receipt.
    const stale = await asTenant(companyId, () =>
      prisma.notification.create({
        data: {
          companyId,
          recipientUserId,
          title: 'Approval needed: PO-123',
          body: 'Please approve.',
          category: 'APPROVAL_PENDING',
          priority: 'HIGH',
          data: { managerUserId },
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
      }),
    );

    const result = await asTenant(companyId, () => escalationChecker.runOnce(24));
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const escalationNotifications = await asTenant(companyId, () =>
      prisma.notification.findMany({
        where: { recipientUserId: managerUserId, category: 'APPROVAL_ESCALATION' },
      }),
    );
    expect(escalationNotifications.length).toBeGreaterThanOrEqual(1);
    expect(escalationNotifications[0]?.data).toMatchObject({ originalNotificationId: stale.id });
  }, 20000);
});
