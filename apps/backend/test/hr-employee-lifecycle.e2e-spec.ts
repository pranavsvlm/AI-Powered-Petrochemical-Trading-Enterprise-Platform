/**
 * Employee lifecycle (doc 15) against real Postgres — see docs/DOMAIN_MODEL_PHASE7.md, HR
 * section. Exercises the actual composed `EmployeeService` (same wiring as
 * apps/backend/src/modules/hr/hr.module.ts), referencing real, already-existing
 * `Department`/`Team` rows (owned by modules/users, never redefined here) through their
 * real lookup ports — not mocks.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { EmployeeService, type DepartmentLookupPort, type TeamLookupPort } from '@modules/hr';
import { UserService, DepartmentRepository, TeamRepository } from '@modules/users';

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

describe('HR: employee lifecycle (live Postgres)', () => {
  let companyId: string;
  let adminUserId: string;
  let managerUserId: string;
  let employeeUserId: string;
  let departmentId: string;
  let teamId: string;
  let managerEmployeeId: string;
  let employeeService: EmployeeService;
  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-HR-${Date.now()}`,
          legalName: 'HR Employee Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const admin = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'HR',
          lastName: 'Admin',
          email: `hr-admin-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    adminUserId = admin.id;

    const manager = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Manager',
          lastName: 'Person',
          email: `hr-manager-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    managerUserId = manager.id;

    const employeeUser = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'New',
          lastName: 'Hire',
          email: `hr-hire-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    employeeUserId = employeeUser.id;

    const userService = new UserService(db, { record: async () => {} });
    const department = await asCompany(companyId, adminUserId, () =>
      userService.createDepartment(companyId, `Trading Ops ${Date.now()}`),
    );
    departmentId = department.id;
    const team = await asCompany(companyId, adminUserId, () =>
      userService.createTeam(companyId, departmentId, `Desk A ${Date.now()}`),
    );
    teamId = team.id;

    const departments: DepartmentLookupPort = {
      getById: (id) => new DepartmentRepository(db).getById(id),
    };
    const teams: TeamLookupPort = { getById: (id) => new TeamRepository(db).getById(id) };
    const audit = {
      record: async (entry: { eventType: string; entityId: string | null }) => {
        auditEntries.push(entry);
      },
    };
    employeeService = new EmployeeService(db, departments, teams, audit);

    const managerEmployee = await asCompany(companyId, adminUserId, () =>
      employeeService.create(
        {
          companyId,
          userId: managerUserId,
          employeeNumber: `EMP-MGR-${Date.now()}`,
          departmentId,
          jobTitle: 'Trading Desk Manager',
          employmentType: 'FULL_TIME',
          hireDate: new Date('2024-01-15'),
        },
        adminUserId,
      ),
    );
    managerEmployeeId = managerEmployee.id;
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.employee.deleteMany({ where: { companyId } });
      await rawDb.team.deleteMany({ where: { companyId } });
      await rawDb.department.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('creates a real Employee linked to a real User/Department/Team, with a real audit entry', async () => {
    const employee = await asCompany(companyId, adminUserId, () =>
      employeeService.create(
        {
          companyId,
          userId: employeeUserId,
          employeeNumber: `EMP-${Date.now()}`,
          departmentId,
          teamId,
          managerId: managerEmployeeId,
          jobTitle: 'Trading Analyst',
          employmentType: 'FULL_TIME',
          hireDate: new Date('2026-01-01'),
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+1-555-0100',
        },
        adminUserId,
      ),
    );

    expect(employee.departmentId).toBe(departmentId);
    expect(employee.teamId).toBe(teamId);
    expect(employee.managerId).toBe(managerEmployeeId);
    expect(employee.employmentStatus).toBe('ACTIVE');

    expect(
      auditEntries.some((e) => e.eventType === 'EMPLOYEE_CREATED' && e.entityId === employee.id),
    ).toBe(true);

    const reports = await asCompany(companyId, adminUserId, () =>
      employeeService.listDirectReports(managerEmployeeId),
    );
    expect(reports.map((r) => r.id)).toContain(employee.id);
  });

  it('rejects creating an employee against a department from another company', async () => {
    const otherCompany = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-HR-OTHER-${Date.now()}`,
          legalName: 'Other Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const otherDept = await withoutTenant(() =>
      rawDb.department.create({ data: { companyId: otherCompany.id, name: 'Other Dept' } }),
    );

    await expect(
      asCompany(companyId, adminUserId, () =>
        employeeService.create(
          {
            companyId,
            userId: employeeUserId,
            employeeNumber: `EMP-CROSS-${Date.now()}`,
            departmentId: otherDept.id,
            jobTitle: 'Should Fail',
            employmentType: 'FULL_TIME',
            hireDate: new Date('2026-01-01'),
          },
          adminUserId,
        ),
      ),
    ).rejects.toThrow();

    await withoutTenant(async () => {
      await rawDb.department.deleteMany({ where: { companyId: otherCompany.id } });
      await rawDb.company.delete({ where: { id: otherCompany.id } });
    });
  });

  it('updates an employee and records a real audit entry', async () => {
    const updated = await asCompany(companyId, adminUserId, () =>
      employeeService.update(
        managerEmployeeId,
        { jobTitle: 'Senior Trading Desk Manager' },
        adminUserId,
      ),
    );
    expect(updated.jobTitle).toBe('Senior Trading Desk Manager');

    expect(
      auditEntries.some(
        (e) => e.eventType === 'EMPLOYEE_UPDATED' && e.entityId === managerEmployeeId,
      ),
    ).toBe(true);
  });
});
