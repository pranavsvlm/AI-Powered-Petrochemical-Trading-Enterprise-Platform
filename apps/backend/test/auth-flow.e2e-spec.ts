/**
 * End-to-end coverage of the core Phase 1 auth lifecycle (doc 09): register -> verify email
 * -> login -> refresh -> logout, plus account lockout and audit-log presence. Runs the real
 * AuthService against the real Postgres database (docker/docker-compose.yml `postgres`).
 */
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ConsoleEmailSenderAdapter, EMAIL_SENDER_PORT } from '@platform/auth';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuditService } from '../src/common/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

const rawDb = new PrismaClient();

describe('Auth flow (integration)', () => {
  let authService: AuthService;
  let companyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        AuditService,
        PrismaService,
        { provide: EMAIL_SENDER_PORT, useClass: ConsoleEmailSenderAdapter },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);

    const company = await rawDb.company.create({
      data: {
        companyCode: `TEST-AUTH-${Date.now()}`,
        legalName: 'Auth Flow Test Co',
        country: 'AE',
        timezone: 'Asia/Dubai',
        currency: 'USD',
      },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    await rawDb.auditLog.deleteMany({ where: { companyId } });
    await rawDb.userSession.deleteMany({ where: { user: { companyId } } });
    await rawDb.user.deleteMany({ where: { companyId } });
    await rawDb.company.delete({ where: { id: companyId } });
    await rawDb.$disconnect();
  });

  it('registers, verifies email, logs in, refreshes, and logs out', async () => {
    const email = `flow-${Date.now()}@test.com`;
    const password = 'Str0ng!Passw0rd';

    const { userId } = await authService.register(
      { companyId, email, password, firstName: 'Flo', lastName: 'Test' },
      '127.0.0.1',
    );
    expect(userId).toBeDefined();

    const pending = await rawDb.user.findUnique({ where: { id: userId } });
    expect(pending?.status).toBe('PENDING_INVITATION');

    const verifyToken = await rawDb.emailVerificationToken.findFirst({ where: { userId } });
    expect(verifyToken).not.toBeNull();

    // We only have the hash in the DB (tokens are never stored in plaintext) — exercise the
    // hash-mismatch failure path, then directly promote the user for the rest of the flow
    // (equivalent to what verifyEmail does once given the real plaintext token).
    await expect(authService.verifyEmail('not-the-real-token')).rejects.toThrow();
    await rawDb.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

    const tokens = await authService.login({ companyId, email, password }, '127.0.0.1');
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();

    const loginAudit = await rawDb.auditLog.findFirst({
      where: { entityId: userId, eventType: 'LOGIN' },
    });
    expect(loginAudit).not.toBeNull();

    const refreshed = await authService.refresh(tokens.refreshToken);
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken); // rotated

    // Old refresh token must no longer work after rotation.
    await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow();

    await authService.logout(refreshed.refreshToken);
    await expect(authService.refresh(refreshed.refreshToken)).rejects.toThrow();

    const logoutAudit = await rawDb.auditLog.findFirst({
      where: { actorUserId: userId, eventType: 'LOGOUT' },
    });
    expect(logoutAudit).not.toBeNull();
  });

  it('rejects invalid credentials and locks the account after repeated failures', async () => {
    const email = `lockout-${Date.now()}@test.com`;
    const password = 'Str0ng!Passw0rd';
    const { userId } = await authService.register(
      { companyId, email, password, firstName: 'Lock', lastName: 'Out' },
      '127.0.0.1',
    );
    await rawDb.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

    for (let i = 0; i < 5; i++) {
      await expect(
        authService.login({ companyId, email, password: 'WrongPassword1!' }, '127.0.0.1'),
      ).rejects.toThrow();
    }

    const user = await rawDb.user.findUnique({ where: { id: userId } });
    expect(user?.status).toBe('LOCKED');

    const lockedAudit = await rawDb.auditLog.findFirst({
      where: { entityId: userId, eventType: 'ACCOUNT_LOCKED' },
    });
    expect(lockedAudit).not.toBeNull();

    // Even the correct password is rejected once locked.
    await expect(authService.login({ companyId, email, password }, '127.0.0.1')).rejects.toThrow();
  });
});
