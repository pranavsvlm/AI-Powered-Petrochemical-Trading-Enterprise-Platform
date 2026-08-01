/**
 * Task lifecycle (doc 25) against real Postgres — see docs/DOMAIN_MODEL_PHASE7.md. Exercises
 * TaskService directly (the same shape apps/backend/src/modules/tasks/tasks.module.ts wires in
 * production), not mocks.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { TaskService } from '@modules/tasks';

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

function buildTaskService() {
  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];
  const audit = {
    record: async (entry: { eventType: string; entityId: string | null }) => {
      auditEntries.push(entry);
    },
  };
  return { taskService: new TaskService(db, audit), auditEntries };
}

describe('Tasks: lifecycle (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let taskService: TaskService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;
  let taskId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-TASK-${Date.now()}`,
          legalName: 'Task Lifecycle Test Co',
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
          firstName: 'Task',
          lastName: 'Tester',
          email: `task-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    ({ taskService, auditEntries } = buildTaskService());
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.taskComment.deleteMany({ where: { task: { companyId } } });
      await rawDb.taskChecklist.deleteMany({ where: { task: { companyId } } });
      await rawDb.task.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('creates a task and records a real audit entry', async () => {
    const task = await asCompany(companyId, userId, () =>
      taskService.create({ companyId, title: 'Prepare Q3 export docs', priority: 'HIGH' }, userId),
    );
    taskId = task.id;
    expect(task.status).toBe('BACKLOG');
    expect(task.priority).toBe('HIGH');
    expect(auditEntries.some((e) => e.eventType === 'TASK_CREATED' && e.entityId === task.id)).toBe(
      true,
    );
  });

  it('adds a comment and a checklist item', async () => {
    const comment = await asCompany(companyId, userId, () =>
      taskService.addComment(taskId, userId, 'Started gathering documents.'),
    );
    expect(comment.content).toBe('Started gathering documents.');

    const item = await asCompany(companyId, userId, () =>
      taskService.addChecklistItem(taskId, 'Collect certificate of origin'),
    );
    expect(item.isDone).toBe(false);

    const updated = await asCompany(companyId, userId, () =>
      taskService.setChecklistItemDone(item.id, true),
    );
    expect(updated.isDone).toBe(true);

    const withChildren = await asCompany(companyId, userId, () => taskService.getById(taskId));
    expect(withChildren.comments).toHaveLength(1);
    expect(withChildren.checklist).toHaveLength(1);
  });

  it('moves the task through the board to COMPLETED and rejects an invalid skip-ahead transition', async () => {
    await asCompany(companyId, userId, () => taskService.changeStatus(taskId, 'PLANNED', userId));
    await asCompany(companyId, userId, () =>
      taskService.changeStatus(taskId, 'IN_PROGRESS', userId),
    );
    await asCompany(companyId, userId, () => taskService.changeStatus(taskId, 'REVIEW', userId));
    const completed = await asCompany(companyId, userId, () =>
      taskService.changeStatus(taskId, 'COMPLETED', userId),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(auditEntries.some((e) => e.eventType === 'TASK_COMPLETED')).toBe(true);

    await expect(
      asCompany(companyId, userId, () => {
        const freshService = new TaskService(db, { record: async () => {} });
        return freshService.changeStatus(taskId, 'BACKLOG', userId);
      }),
    ).rejects.toThrow();
  });

  it('assigns the task and archives it (no real DELETE)', async () => {
    const assigned = await asCompany(companyId, userId, () =>
      taskService.assign(taskId, userId, undefined, userId),
    );
    expect(assigned.assigneeUserId).toBe(userId);
    expect(auditEntries.some((e) => e.eventType === 'TASK_ASSIGNED')).toBe(true);

    const archived = await asCompany(companyId, userId, () => taskService.archive(taskId, userId));
    expect(archived.status).toBe('ARCHIVED');

    const stillExists = await withoutTenant(() => rawDb.task.findUnique({ where: { id: taskId } }));
    expect(stillExists).not.toBeNull();
  });
});
