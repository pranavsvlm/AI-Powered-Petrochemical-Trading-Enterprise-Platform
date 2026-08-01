/**
 * Payroll profile / Performance review / Training record / Employee asset CRUD (doc 15) against
 * real Postgres — see docs/DOMAIN_MODEL_PHASE7.md, HR section. Payroll is "architecture ready"
 * only: a real salary-structure row, no payroll-run computation.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { EmployeeRecordsService } from '@modules/hr';

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

describe('HR: payroll/performance/training/assets (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let employeeId: string;
  let service: EmployeeRecordsService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-HR-REC-${Date.now()}`,
          legalName: 'HR Records Test Co',
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
          firstName: 'Records',
          lastName: 'Tester',
          email: `hr-records-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const employee = await withoutTenant(() =>
      rawDb.employee.create({
        data: {
          companyId,
          userId,
          employeeNumber: `EMP-REC-${Date.now()}`,
          jobTitle: 'Analyst',
          employmentType: 'FULL_TIME',
          hireDate: new Date('2025-06-01'),
        },
      }),
    );
    employeeId = employee.id;

    service = new EmployeeRecordsService(db, { record: async () => {} });
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.employeeAsset.deleteMany({ where: { companyId } });
      await rawDb.trainingRecord.deleteMany({ where: { companyId } });
      await rawDb.performanceReview.deleteMany({ where: { companyId } });
      await rawDb.payrollProfile.deleteMany({ where: { companyId } });
      await rawDb.employee.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('sets and re-reads a real payroll profile (architecture-ready, no payroll run)', async () => {
    const profile = await asCompany(companyId, userId, () =>
      service.setPayrollProfile(
        {
          companyId,
          employeeId,
          baseSalary: 8000,
          currency: 'USD',
          allowances: { housing: 500 },
          deductions: { tax: 300 },
          effectiveFrom: new Date('2026-01-01'),
        },
        userId,
      ),
    );
    expect(Number(profile.baseSalary)).toBe(8000);

    const fetched = await asCompany(companyId, userId, () => service.getPayrollProfile(employeeId));
    expect(fetched.id).toBe(profile.id);
    expect(fetched.allowances).toEqual({ housing: 500 });
  });

  it('records a real performance review', async () => {
    const review = await asCompany(companyId, userId, () =>
      service.addPerformanceReview(
        {
          companyId,
          employeeId,
          reviewerUserId: userId,
          period: '2026-H1',
          rating: 4,
          feedback: 'Strong quarter.',
        },
        userId,
      ),
    );
    expect(review.rating).toBe(4);

    const reviews = await asCompany(companyId, userId, () =>
      service.listPerformanceReviews(companyId, employeeId),
    );
    expect(reviews.map((r) => r.id)).toContain(review.id);
  });

  it('records a real training record', async () => {
    const record = await asCompany(companyId, userId, () =>
      service.addTrainingRecord(
        {
          companyId,
          employeeId,
          courseName: 'HSE Fundamentals',
          certificationName: 'HSE-100',
          completedAt: new Date('2026-01-10'),
          expiresAt: new Date('2028-01-10'),
        },
        userId,
      ),
    );
    expect(record.certificationName).toBe('HSE-100');

    const records = await asCompany(companyId, userId, () =>
      service.listTrainingRecords(companyId, employeeId),
    );
    expect(records.map((r) => r.id)).toContain(record.id);
  });

  it('assigns and returns a real employee asset', async () => {
    const asset = await asCompany(companyId, userId, () =>
      service.assignAsset(
        { companyId, employeeId, assetType: 'Laptop', description: 'MacBook Pro 14"' },
        userId,
      ),
    );
    expect(asset.returnedAt).toBeNull();

    const returned = await asCompany(companyId, userId, () =>
      service.returnAsset(asset.id, companyId, userId),
    );
    expect(returned.returnedAt).not.toBeNull();

    const assets = await asCompany(companyId, userId, () =>
      service.listAssets(companyId, employeeId),
    );
    expect(assets.map((a) => a.id)).toContain(asset.id);
  });
});
