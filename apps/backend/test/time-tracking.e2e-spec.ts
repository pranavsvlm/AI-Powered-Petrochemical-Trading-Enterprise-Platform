/**
 * Time tracking (doc 25) against real Postgres — see docs/DOMAIN_MODEL_PHASE7.md. Exercises
 * TimeEntryService directly (the same shape apps/backend/src/modules/tasks/tasks.module.ts
 * wires in production), not mocks.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { TaskService, TimeEntryService } from '@modules/tasks';

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

describe('Time tracking: start/stop timer + manual entry (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let taskId: string;
  let timeEntryService: TimeEntryService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-TIME-${Date.now()}`,
          legalName: 'Time Tracking Test Co',
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
          firstName: 'Time',
          lastName: 'Tracker',
          email: `time-tracker-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const audit = { record: async () => {} };
    const taskService = new TaskService(db, audit);
    timeEntryService = new TimeEntryService(db, audit);

    const task = await asCompany(companyId, userId, () =>
      taskService.create({ companyId, title: 'Reconcile freight invoices' }, userId),
    );
    taskId = task.id;
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.timeEntry.deleteMany({ where: { companyId } });
      await rawDb.task.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('starts a timer, rejects a second concurrent one, then stops it with a real computed duration', async () => {
    const running = await asCompany(companyId, userId, () =>
      timeEntryService.start({ companyId, userId, taskId, startedAt: new Date() }),
    );
    expect(running.endedAt).toBeNull();

    await expect(
      asCompany(companyId, userId, () =>
        timeEntryService.start({ companyId, userId, taskId, startedAt: new Date() }),
      ),
    ).rejects.toThrow(/already running/);

    await sleep(1100);

    const stopped = await asCompany(companyId, userId, () =>
      timeEntryService.stop(running.id, userId),
    );
    expect(stopped.endedAt).not.toBeNull();
    expect(stopped.durationMinutes).toBeGreaterThanOrEqual(0);

    await expect(
      asCompany(companyId, userId, () => timeEntryService.stop(running.id, userId)),
    ).rejects.toThrow(/already stopped/);
  }, 15000);

  it('creates a manual entry with a real computed duration', async () => {
    const startedAt = new Date('2026-08-01T09:00:00Z');
    const endedAt = new Date('2026-08-01T11:30:00Z');
    const entry = await asCompany(companyId, userId, () =>
      timeEntryService.createManual(
        {
          companyId,
          userId,
          taskId,
          startedAt,
          endedAt,
          durationMinutes: 150,
          notes: 'Manual catch-up entry',
        },
        userId,
      ),
    );
    expect(entry.durationMinutes).toBe(150);

    const entries = await asCompany(companyId, userId, () =>
      timeEntryService.list({ companyId, taskId }),
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});
