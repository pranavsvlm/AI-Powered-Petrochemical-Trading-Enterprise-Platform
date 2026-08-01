/**
 * Communication → Tasks cross-phase integration (doc 19) against real Postgres + real Redis —
 * see docs/DOMAIN_MODEL_PHASE7.md, Communication section. Proves CommsService.createTaskFromThread
 * publishes a real TaskGenerationRequested event through the real RedisStreamsEventBus, picked up
 * by Phase 7a's already-running registerTaskGenerationRequestedSubscriber with zero new code on
 * the Tasks side.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the stack in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { TaskService, registerTaskGenerationRequestedSubscriber } from '@modules/tasks';
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Communication: real cross-phase Task creation (live Postgres + Redis)', () => {
  let companyId: string;
  let userId: string;
  let service: CommsService;
  let threadId: string;
  let unsubscribe: () => Promise<void>;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-COMMSTASK-${Date.now()}`,
          legalName: 'Communication Task Test Co',
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
          lastName: 'TaskCreator',
          email: `comms-task-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const taskAudit = { record: async () => {} };
    const taskService = new TaskService(db, taskAudit);
    const eventBus = new RedisStreamsEventBus();
    unsubscribe = await registerTaskGenerationRequestedSubscriber(eventBus, taskService);

    const commsAudit = { record: async () => {} };
    const emailSender = { send: async () => {} };
    const notifications: CommsNotificationPort = {
      notify: async () => ({ notificationId: 'unused' }),
    };
    const customerActivity: CustomerActivityPort = { record: async () => {} };
    service = new CommsService(
      db,
      commsAudit,
      eventBus,
      emailSender,
      notifications,
      customerActivity,
    );

    const thread = await asCompany(companyId, userId, () =>
      service.createThread({ companyId, type: 'INTERNAL', title: 'Follow up needed' }, userId),
    );
    threadId = thread.id;
  }, 20000);

  afterAll(async () => {
    await unsubscribe();
    await withoutTenant(async () => {
      await rawDb.task.deleteMany({ where: { companyId } });
      await rawDb.commsThread.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it("publishing createTaskFromThread results in a real Task row via Phase 7a's consumer", async () => {
    await asCompany(companyId, userId, () =>
      service.createTaskFromThread(
        threadId,
        {
          title: 'Call supplier about delayed shipment',
          description: 'Raised from a comms thread.',
        },
        userId,
      ),
    );

    let task = null;
    for (let i = 0; i < 20; i++) {
      task = await withoutTenant(() =>
        rawDb.task.findFirst({ where: { companyId, sourceEntityId: threadId } }),
      );
      if (task) break;
      await sleep(300);
    }

    expect(task).not.toBeNull();
    expect(task!.title).toBe('Call supplier about delayed shipment');
    expect(task!.sourceModule).toBe('communication');
    expect(task!.sourceEntityId).toBe(threadId);
  }, 20000);
});
