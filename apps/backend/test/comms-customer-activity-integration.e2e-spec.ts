/**
 * Communication → CRM Timeline integration (doc 19) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE7.md, Communication section. Proves the narrow CustomerActivityPort,
 * satisfied at the composition root by CustomerService.addActivity in production, actually
 * results in a real CustomerActivity row (type: MESSAGE) — not just that the port is called.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
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

describe('Communication: CRM Timeline integration (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let customerId: string;
  let service: CommsService;
  let threadId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-COMMSCRM-${Date.now()}`,
          legalName: 'Communication CRM Test Co',
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
          firstName: 'CRM',
          lastName: 'Tester',
          email: `comms-crm-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const customer = await withoutTenant(() =>
      rawDb.customer.create({
        data: {
          companyId,
          customerCode: `CUST-COMMS-${Date.now()}`,
          legalName: 'Petro Import Partners LLC',
          country: 'AE',
          currency: 'USD',
          status: 'ACTIVE',
        },
      }),
    );
    customerId = customer.id;

    const audit = { record: async () => {} };
    const events = { publish: async () => ({ eventId: 'unused' }) };
    const emailSender = { send: async () => {} };
    const notifications: CommsNotificationPort = {
      notify: async () => ({ notificationId: 'unused' }),
    };
    // The real integration point: CustomerService.addActivity's own repo call, matching what
    // apps/backend/src/modules/comms/comms.module.ts wires via CustomerService in production.
    const customerActivity: CustomerActivityPort = {
      record: async (customerId, type, body, authorUserId) => {
        await rawDb.customerActivity.create({ data: { customerId, type, body, authorUserId } });
      },
    };
    service = new CommsService(db, audit, events, emailSender, notifications, customerActivity);
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.customerActivity.deleteMany({ where: { customerId } });
      await rawDb.commsMessage.deleteMany({ where: { thread: { companyId } } });
      await rawDb.commsParticipant.deleteMany({ where: { thread: { companyId } } });
      await rawDb.commsThread.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.customer.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('sending a message on a CUSTOMER-subject thread records a real CustomerActivity row', async () => {
    const thread = await asCompany(companyId, userId, () =>
      service.createThread(
        {
          companyId,
          type: 'CUSTOMER',
          subjectType: 'Customer',
          subjectId: customerId,
          title: 'Order status',
        },
        userId,
      ),
    );
    threadId = thread.id;

    await asCompany(companyId, userId, () =>
      service.sendMessage(
        threadId,
        {
          direction: 'OUTBOUND',
          channel: 'IN_APP',
          content: 'Your shipment cleared customs today.',
        },
        userId,
      ),
    );

    const activities = await withoutTenant(() =>
      rawDb.customerActivity.findMany({ where: { customerId } }),
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('MESSAGE');
    expect(activities[0].body).toBe('Your shipment cleared customs today.');
    expect(activities[0].authorUserId).toBe(userId);
  });

  it('does not touch CustomerActivity for a non-CUSTOMER thread', async () => {
    const internalThread = await asCompany(companyId, userId, () =>
      service.createThread({ companyId, type: 'INTERNAL', title: 'Internal note' }, userId),
    );
    await asCompany(companyId, userId, () =>
      service.sendMessage(
        internalThread.id,
        { direction: 'OUTBOUND', channel: 'IN_APP', content: 'No customer linkage here.' },
        userId,
      ),
    );

    const activities = await withoutTenant(() =>
      rawDb.customerActivity.findMany({ where: { customerId } }),
    );
    expect(activities).toHaveLength(1);
  });
});
