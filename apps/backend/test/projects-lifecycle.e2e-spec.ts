/**
 * Project lifecycle (doc 25) against real Postgres — see docs/DOMAIN_MODEL_PHASE7.md. Exercises
 * ProjectService + TaskService together (a project with members, a milestone, and a linked
 * task), the same shape apps/backend/src/modules/tasks/tasks.module.ts wires in production.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { ProjectService, TaskService } from '@modules/tasks';

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

describe('Projects: lifecycle (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let secondUserId: string;
  let projectService: ProjectService;
  let taskService: TaskService;
  let projectId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-PROJ-${Date.now()}`,
          legalName: 'Project Lifecycle Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const [user, secondUser] = await withoutTenant(() =>
      Promise.all([
        rawDb.user.create({
          data: {
            companyId,
            firstName: 'Project',
            lastName: 'Owner',
            email: `project-owner-${Date.now()}@test.local`,
            passwordHash: 'x',
            status: 'ACTIVE',
          },
        }),
        rawDb.user.create({
          data: {
            companyId,
            firstName: 'Project',
            lastName: 'Member',
            email: `project-member-${Date.now()}@test.local`,
            passwordHash: 'x',
            status: 'ACTIVE',
          },
        }),
      ]),
    );
    userId = user.id;
    secondUserId = secondUser.id;

    const audit = { record: async () => {} };
    projectService = new ProjectService(db, audit);
    taskService = new TaskService(db, audit);
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.task.deleteMany({ where: { companyId } });
      await rawDb.projectMilestone.deleteMany({ where: { project: { companyId } } });
      await rawDb.projectMember.deleteMany({ where: { project: { companyId } } });
      await rawDb.project.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('creates a project owned by a user', async () => {
    const project = await asCompany(companyId, userId, () =>
      projectService.create(
        { companyId, name: 'Export Compliance Overhaul', ownerUserId: userId },
        userId,
      ),
    );
    projectId = project.id;
    expect(project.status).toBe('ACTIVE');
  });

  it('adds members and a milestone', async () => {
    await asCompany(companyId, userId, () => projectService.addMember(projectId, userId));
    await asCompany(companyId, userId, () => projectService.addMember(projectId, secondUserId));
    const milestone = await asCompany(companyId, userId, () =>
      projectService.addMilestone(projectId, 'Phase 1 audit complete', new Date('2026-09-01')),
    );
    expect(milestone.status).toBe('PENDING');

    const withChildren = await asCompany(companyId, userId, () =>
      projectService.getById(projectId),
    );
    expect(withChildren.members).toHaveLength(2);
    expect(withChildren.milestones).toHaveLength(1);

    const completed = await asCompany(companyId, userId, () =>
      projectService.completeMilestone(milestone.id),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
  });

  it('links a real task to the project', async () => {
    const task = await asCompany(companyId, userId, () =>
      taskService.create({ companyId, title: 'Draft new SOP', projectId }, userId),
    );
    expect(task.projectId).toBe(projectId);

    const withChildren = await asCompany(companyId, userId, () =>
      projectService.getById(projectId),
    );
    expect(withChildren.tasks.map((t) => t.id)).toContain(task.id);
  });

  it('archives the project without deleting its rows', async () => {
    const archived = await asCompany(companyId, userId, () => projectService.archive(projectId));
    expect(archived.status).toBe('ARCHIVED');
    const stillExists = await withoutTenant(() =>
      rawDb.project.findUnique({ where: { id: projectId } }),
    );
    expect(stillExists).not.toBeNull();
  });
});
