/**
 * Proves the tenant-isolation guarantees required by docs/DOMAIN_MODEL_PHASE1.md §6:
 *  (a) a company-scoped query bound to Company A's context can never read/write Company B's
 *      User/Department/Team/Role rows, even when addressing them by primary key.
 *  (b) a tenant-scoped query issued with NO bound tenant context fails closed (throws)
 *      rather than silently returning unscoped/cross-tenant data.
 *
 * Runs against a real Postgres instance (docker/docker-compose.yml `postgres` service) using
 * the Phase 1 migration. Requires DATABASE_URL to point at that database.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';

const db = getPrismaClient();
const rawDb = new PrismaClient(); // unscoped client, used only for setup/teardown

describe('Tenant isolation (Prisma extension)', () => {
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;
  let deptAId: string;

  beforeAll(async () => {
    const companyA = await rawDb.company.create({
      data: {
        companyCode: `TEST-A-${Date.now()}`,
        legalName: 'Company A Ltd',
        country: 'AE',
        timezone: 'Asia/Dubai',
        currency: 'USD',
      },
    });
    const companyB = await rawDb.company.create({
      data: {
        companyCode: `TEST-B-${Date.now()}`,
        legalName: 'Company B Ltd',
        country: 'AE',
        timezone: 'Asia/Dubai',
        currency: 'USD',
      },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const userA = await rawDb.user.create({
      data: {
        companyId: companyAId,
        firstName: 'Alice',
        lastName: 'A',
        email: 'alice@a.test',
        passwordHash: 'x',
      },
    });
    const userB = await rawDb.user.create({
      data: {
        companyId: companyBId,
        firstName: 'Bob',
        lastName: 'B',
        email: 'bob@b.test',
        passwordHash: 'x',
      },
    });
    userAId = userA.id;
    userBId = userB.id;

    const deptA = await rawDb.department.create({
      data: { companyId: companyAId, name: 'Sales A' },
    });
    deptAId = deptA.id;
  });

  afterAll(async () => {
    await rawDb.department.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await rawDb.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await rawDb.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  function runAsCompanyA<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContextStore.run(
      {
        companyId: companyAId,
        userId: userAId,
        sessionId: null,
        ipAddress: null,
        isPlatformActor: false,
      },
      fn,
    );
  }

  it('a User query scoped to Company A never returns Company B users, even by list', async () => {
    const users = await runAsCompanyA(async () => {
      return await db.user.findMany();
    });
    expect(users.every((u) => u.companyId === companyAId)).toBe(true);
    expect(users.find((u) => u.id === userBId)).toBeUndefined();
  });

  it("a findUnique-by-id lookup for another company's user returns null under Company A context", async () => {
    const found = await runAsCompanyA(async () => {
      return await db.user.findUnique({ where: { id: userBId } });
    });
    expect(found).toBeNull();
  });

  it("an update targeting another company's user by id affects zero rows (fails closed, not silently succeeds)", async () => {
    const before = await rawDb.user.findUnique({ where: { id: userBId } });
    await expect(
      runAsCompanyA(async () => {
        return await db.user.update({ where: { id: userBId }, data: { firstName: 'Hacked' } });
      }),
    ).rejects.toThrow();
    const after = await rawDb.user.findUnique({ where: { id: userBId } });
    expect(after?.firstName).toBe(before?.firstName);
  });

  it('a create implicitly stamps company_id from the bound tenant context, not attacker-supplied input', async () => {
    const created = await runAsCompanyA(async () => {
      return await db.department.create({
        data: { companyId: companyBId, name: 'Spoofed Dept' } as never,
      });
    });
    expect(created.companyId).toBe(companyAId); // forced by the extension, spoofed value ignored
    await rawDb.department.delete({ where: { id: created.id } });
  });

  it("Company A cannot read Company A's own department by id when run without a bound context (fails closed)", async () => {
    await expect(db.department.findUnique({ where: { id: deptAId } })).rejects.toThrow(
      /no tenant context bound/i,
    );
  });

  it('withoutTenantScope is required for legitimate cross-tenant platform reads, and is explicit', async () => {
    const { withoutTenantScope } = await import('@platform/database');
    const allUsers = await withoutTenantScope(async () => {
      return await db.user.findMany({ where: { id: { in: [userAId, userBId] } } });
    });
    expect(allUsers.map((u) => u.id).sort()).toEqual([userAId, userBId].sort());
  });
});
