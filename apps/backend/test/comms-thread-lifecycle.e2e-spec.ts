/**
 * Communication thread lifecycle (doc 19) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE7.md, Communication section. Exercises CommsService directly (the same
 * shape apps/backend/src/modules/comms/comms.module.ts wires in production), not mocks, for the
 * real send channels (IN_APP, EMAIL) and the fail-fast seam channels (WHATSAPP/SMS/PUSH).
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { ChannelNotAvailableError, ConsoleEmailSenderAdapter } from '@platform/notifications';
import {
  CommsService,
  type CommsNotificationPort,
  type CustomerActivityPort,
} from '@modules/communication';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

function buildCommsService() {
  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];
  const audit = {
    record: async (entry: { eventType: string; entityId: string | null }) => {
      auditEntries.push(entry);
    },
  };
  const events = { publish: async () => ({ eventId: 'unused' }) };
  const emailSends: Array<{ to: string; subject: string; body: string }> = [];
  const realEmailAdapter = new ConsoleEmailSenderAdapter();
  const emailSender = {
    send: async (message: { to: string; subject: string; body: string }) => {
      emailSends.push(message);
      return realEmailAdapter.send(message);
    },
  };
  const notifications: CommsNotificationPort = {
    notify: async () => ({ notificationId: 'unused' }),
  };
  const customerActivity: CustomerActivityPort = { record: async () => {} };
  const service = new CommsService(db, audit, events, emailSender, notifications, customerActivity);
  return { service, auditEntries, emailSends };
}

describe('Communication: thread lifecycle (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let service: CommsService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;
  let emailSends: Array<{ to: string; subject: string; body: string }>;
  let threadId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-COMMS-${Date.now()}`,
          legalName: 'Communication Lifecycle Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Comms',
          lastName: 'Tester',
          email: `comms-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    ({ service, auditEntries, emailSends } = buildCommsService());
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.commsMessage.deleteMany({ where: { thread: { companyId } } });
      await rawDb.commsParticipant.deleteMany({ where: { thread: { companyId } } });
      await rawDb.commsThread.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('creates a thread and records a real audit entry', async () => {
    const thread = await asCompany(companyId, userId, () =>
      service.createThread({ companyId, type: 'INTERNAL', title: 'Q3 export planning' }, userId),
    );
    threadId = thread.id;
    expect(thread.status).toBe('ACTIVE');
    expect(
      auditEntries.some((e) => e.eventType === 'COMMS_THREAD_CREATED' && e.entityId === thread.id),
    ).toBe(true);
  });

  it('adds an internal and an external participant', async () => {
    await asCompany(companyId, userId, () => service.addParticipant(threadId, { userId }, userId));
    await asCompany(companyId, userId, () =>
      service.addParticipant(
        threadId,
        { externalName: 'Supplier Contact', externalIdentifier: 'contact@supplier.example' },
        userId,
      ),
    );
    const thread = await asCompany(companyId, userId, () => service.getById(threadId));
    expect(thread.participants).toHaveLength(2);
  });

  it('sends a real IN_APP message', async () => {
    const message = await asCompany(companyId, userId, () =>
      service.sendMessage(
        threadId,
        { direction: 'OUTBOUND', channel: 'IN_APP', content: 'Kickoff call at 3pm.' },
        userId,
      ),
    );
    expect(message.channel).toBe('IN_APP');
    expect(
      auditEntries.some((e) => e.eventType === 'COMMS_MESSAGE_SENT' && e.entityId === threadId),
    ).toBe(true);
  });

  it('sends a real EMAIL message via EmailSenderPort to the external participant', async () => {
    await asCompany(companyId, userId, () =>
      service.sendMessage(
        threadId,
        { direction: 'OUTBOUND', channel: 'EMAIL', content: 'Please confirm the shipment date.' },
        userId,
      ),
    );
    expect(emailSends).toHaveLength(1);
    expect(emailSends[0].to).toBe('contact@supplier.example');
    expect(emailSends[0].body).toBe('Please confirm the shipment date.');
  });

  it('fails fast on a WHATSAPP send with ChannelNotAvailableError, persisting nothing', async () => {
    const before = await asCompany(companyId, userId, () => service.listMessages(threadId));

    await expect(
      asCompany(companyId, userId, () =>
        service.sendMessage(
          threadId,
          { direction: 'OUTBOUND', channel: 'WHATSAPP', content: 'Should never persist.' },
          userId,
        ),
      ),
    ).rejects.toThrow(ChannelNotAvailableError);

    const after = await asCompany(companyId, userId, () => service.listMessages(threadId));
    expect(after).toHaveLength(before.length);
  });

  it('records an INBOUND message on a seam channel without gating (data entry, not dispatch)', async () => {
    const message = await asCompany(companyId, userId, () =>
      service.sendMessage(
        threadId,
        { direction: 'INBOUND', channel: 'WHATSAPP', content: 'Reply received via WhatsApp.' },
        userId,
      ),
    );
    expect(message.direction).toBe('INBOUND');
  });

  it('closes the thread', async () => {
    const closed = await asCompany(companyId, userId, () => service.close(threadId));
    expect(closed.status).toBe('CLOSED');
  });
});
