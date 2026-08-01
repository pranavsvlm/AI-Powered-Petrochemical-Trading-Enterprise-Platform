/**
 * Attendance clock-in/clock-out and Leave request/approval (doc 15) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE7.md, HR section. Leave approval is delegated entirely to the real
 * Rules Engine and the platform's existing generic `ApprovalRequest` table — the exact
 * `QuotationService.requestApproval`/`.decideApproval` pattern, not a new approval mechanism.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the stack in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleManagementService,
  RuleRepository,
} from '@platform/rules-engine';
import { AttendanceService, LeaveService, type ApprovalEvaluator } from '@modules/hr';

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

describe('HR: attendance and leave (live Postgres + Redis)', () => {
  let companyId: string;
  let userId: string;
  let employeeId: string;
  let attendanceService: AttendanceService;
  let leaveService: LeaveService;
  let ruleManagement: RuleManagementService;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-HR-ATT-${Date.now()}`,
          legalName: 'HR Attendance Test Co',
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
          firstName: 'Attendance',
          lastName: 'Tester',
          email: `hr-attendance-tester-${Date.now()}@test.local`,
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
          employeeNumber: `EMP-ATT-${Date.now()}`,
          jobTitle: 'Operations Staff',
          employmentType: 'FULL_TIME',
          hireDate: new Date('2025-01-01'),
        },
      }),
    );
    employeeId = employee.id;

    const audit = { record: async () => {} };
    attendanceService = new AttendanceService(db, audit);

    const ruleRepository = new RuleRepository(db);
    ruleManagement = new RuleManagementService(db, ruleRepository);
    const ruleActionExecutor = new RuleActionExecutor({
      eventBus: new RedisStreamsEventBus(),
      aiDecisionProvider: new NotImplementedAiDecisionProvider(),
    });
    const approvalEvaluator: ApprovalEvaluator = new RuleEvaluationService(
      ruleRepository,
      ruleActionExecutor,
      [
        new LegacyApprovalRuleSource(db),
        new NativeRuleSource((cid, module) => ruleRepository.loadApplicable(cid, module)),
      ],
    );
    leaveService = new LeaveService(db, approvalEvaluator, audit);
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.approvalRequest.deleteMany({ where: { companyId } });
      await rawDb.leaveRequest.deleteMany({ where: { companyId } });
      await rawDb.leavePolicy.deleteMany({ where: { companyId } });
      await rawDb.attendanceRecord.deleteMany({ where: { companyId } });
      await rawDb.ruleVersion.deleteMany({ where: { rule: { companyId } } });
      await rawDb.rule.deleteMany({ where: { companyId } });
      await rawDb.employee.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('clocks in and out, computing real worked/overtime hours', async () => {
    const record = await asCompany(companyId, userId, () =>
      attendanceService.clockIn(companyId, employeeId),
    );
    expect(record.clockOutAt).toBeNull();

    await expect(
      asCompany(companyId, userId, () => attendanceService.clockIn(companyId, employeeId)),
    ).rejects.toThrow();

    // Backdate clockInAt directly so worked hours are deterministic in the test.
    await withoutTenant(() =>
      rawDb.attendanceRecord.update({
        where: { id: record.id },
        data: { clockInAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
      }),
    );

    const result = await asCompany(companyId, userId, () =>
      attendanceService.clockOut(record.id, userId, 8),
    );
    expect(result.workedHours).toBeCloseTo(9, 1);
    expect(result.overtimeHours).toBeCloseTo(1, 1);
  });

  it('auto-approves a leave request when no approval rule matches (zero approvers)', async () => {
    const policy = await asCompany(companyId, userId, () =>
      leaveService.createPolicy({
        companyId,
        type: 'ANNUAL',
        name: 'Annual Leave',
        daysPerYear: 20,
      }),
    );

    const request = await asCompany(companyId, userId, () =>
      leaveService.requestLeave(
        {
          companyId,
          employeeId,
          policyId: policy.id,
          startDate: new Date('2026-02-02'),
          endDate: new Date('2026-02-04'),
        },
        userId,
      ),
    );
    expect(request.status).toBe('APPROVED');

    const balance = await asCompany(companyId, userId, () =>
      leaveService.getBalance(employeeId, policy.id, new Date('2026-02-15')),
    );
    expect(balance).toBe(17); // 20 - 3 inclusive days
  });

  it('creates a real ApprovalRequest when a real rule matches, then resolves it via decide()', async () => {
    const policy = await asCompany(companyId, userId, () =>
      leaveService.createPolicy({
        companyId,
        type: 'SICK',
        name: 'Sick Leave',
        daysPerYear: 10,
      }),
    );

    const rule = await asCompany(companyId, userId, () =>
      ruleManagement.create({
        companyId,
        name: 'hr-leave-requires-approval',
        module: 'hr',
        priority: 10,
        condition: { '>=': [{ var: 'days' }, 1] } as never,
        actions: [{ type: 'REQUEST_APPROVAL', params: { approverUserId: userId } }],
      }),
    );
    await asCompany(companyId, userId, () => ruleManagement.publish(rule.id));

    const request = await asCompany(companyId, userId, () =>
      leaveService.requestLeave(
        {
          companyId,
          employeeId,
          policyId: policy.id,
          startDate: new Date('2026-03-01'),
          endDate: new Date('2026-03-01'),
        },
        userId,
      ),
    );
    expect(request.status).toBe('PENDING');

    const approvals = await withoutTenant(() =>
      rawDb.approvalRequest.findMany({
        where: { entityType: 'LeaveRequest', entityId: request.id },
      }),
    );
    expect(approvals).toHaveLength(1);

    const decided = await asCompany(companyId, userId, () =>
      leaveService.decide(approvals[0].id, 'APPROVED', userId, 'looks fine'),
    );
    expect(decided.status).toBe('APPROVED');

    const balance = await asCompany(companyId, userId, () =>
      leaveService.getBalance(employeeId, policy.id, new Date('2026-03-15')),
    );
    expect(balance).toBe(9);
  });
});
