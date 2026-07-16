import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  EMAIL_SENDER_PORT,
  type EmailSenderPort,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateOpaqueToken,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTotpToken,
} from '@platform/auth';
import { AuditEventType, TenantContextStore } from '@platform/core';
import { UserStatus, type JwtAccessTokenPayload } from '@platform/types';
import { withoutTenantScope, MfaMethod } from '@platform/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes — short-lived per doc 09
const REFRESH_TOKEN_TTL_DAYS = 30;
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.ACCOUNT_LOCKOUT_MINUTES ?? 15);
const MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY ?? 'dev-mfa-encryption-key-change-me';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(EMAIL_SENDER_PORT) private readonly emailSender: EmailSenderPort,
  ) {}

  async register(dto: RegisterDto, ip: string | null): Promise<{ userId: string }> {
    return TenantContextStore.run(
      {
        companyId: dto.companyId,
        userId: null,
        sessionId: null,
        ipAddress: ip,
        isPlatformActor: false,
      },
      async () => {
        const existing = await this.prisma.client.user.findFirst({ where: { email: dto.email } });
        if (existing) {
          throw new ConflictException('A user with this email already exists in this company.');
        }
        const passwordHash = await hashPassword(dto.password);

        const user = await this.prisma.client.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              companyId: dto.companyId,
              email: dto.email,
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone,
              passwordHash,
              status: UserStatus.PENDING_INVITATION,
            },
          });
          await this.audit.record(
            {
              companyId: dto.companyId,
              actorUserId: created.id,
              eventType: AuditEventType.USER_CREATED,
              entityType: 'User',
              entityId: created.id,
              after: { email: created.email, status: created.status },
              ipAddress: ip,
            },
            tx,
          );
          return created;
        });

        const verifyToken = generateOpaqueToken();
        await this.prisma.client.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(verifyToken),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await this.emailSender.send({
          to: user.email,
          subject: 'Verify your email',
          body: `Your verification token is: ${verifyToken}`,
        });

        this.logger.log(`Registered user ${user.id} in company ${dto.companyId}`);
        return { userId: user.id };
      },
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await withoutTenantScope(() =>
      this.prisma.client.emailVerificationToken.findUnique({ where: { tokenHash } }),
    );
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token.');
    }
    await withoutTenantScope(() =>
      this.prisma.client.$transaction([
        this.prisma.client.emailVerificationToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        this.prisma.client.user.update({
          where: { id: record.userId },
          data: { status: UserStatus.ACTIVE },
        }),
      ]),
    );
  }

  async login(dto: LoginDto, ip: string | null): Promise<AuthTokens> {
    return TenantContextStore.run(
      {
        companyId: dto.companyId,
        userId: null,
        sessionId: null,
        ipAddress: ip,
        isPlatformActor: false,
      },
      async () => {
        const user = await this.prisma.client.user.findFirst({ where: { email: dto.email } });
        if (!user) {
          await this.recordFailedLogin(null, dto.companyId, ip, 'unknown user');
          throw new UnauthorizedException('Invalid credentials.');
        }

        if (
          user.status === UserStatus.LOCKED ||
          (user.lockedUntil && user.lockedUntil > new Date())
        ) {
          throw new UnauthorizedException(
            'Account is locked. Try again later or reset your password.',
          );
        }
        if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.ARCHIVED) {
          throw new UnauthorizedException('Account is not active.');
        }

        const valid = await verifyPassword(user.passwordHash, dto.password);
        if (!valid) {
          await this.recordFailedLogin(user.id, dto.companyId, ip, 'bad password');
          throw new UnauthorizedException('Invalid credentials.');
        }

        const mfa = await this.prisma.client.userMfa.findFirst({
          where: { userId: user.id, enabled: true },
        });
        if (mfa) {
          if (!dto.mfaToken) {
            throw new UnauthorizedException('MFA token required.');
          }
          const ok = await this.verifyMfaToken(mfa, dto.mfaToken);
          if (!ok) {
            await this.recordFailedLogin(user.id, dto.companyId, ip, 'bad mfa token');
            throw new UnauthorizedException('Invalid MFA token.');
          }
        }

        const refreshToken = generateOpaqueToken();
        const session = await this.prisma.client.$transaction(async (tx) => {
          const created = await tx.userSession.create({
            data: {
              userId: user.id,
              device: dto.device,
              browser: dto.browser,
              os: dto.os,
              ipAddress: ip,
              refreshTokenHash: hashToken(refreshToken),
              expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
          });
          await tx.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date(), failedLoginAttempts: 0, lockedUntil: null },
          });
          await this.audit.record(
            {
              companyId: dto.companyId,
              actorUserId: user.id,
              eventType: AuditEventType.LOGIN,
              entityType: 'User',
              entityId: user.id,
              ipAddress: ip,
            },
            tx,
          );
          return created;
        });

        const roles = await this.prisma.client.userRole.findMany({ where: { userId: user.id } });
        const accessToken = this.signAccessToken({
          sub: user.id,
          companyId: dto.companyId,
          email: user.email,
          sessionId: session.id,
          roles: roles.map((r) => r.roleId),
          type: 'access',
        });

        return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
      },
    );
  }

  private async recordFailedLogin(
    userId: string | null,
    companyId: string,
    ip: string | null,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Failed login for company=${companyId} user=${userId ?? 'unknown'} reason=${reason}`,
    );
    await this.audit.record({
      companyId,
      actorUserId: userId,
      eventType: AuditEventType.LOGIN_FAILED,
      entityType: 'User',
      entityId: userId,
      ipAddress: ip,
      after: { reason },
    });
    if (!userId) return;

    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await this.prisma.client.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.LOCKED,
          lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
        },
      });
      await this.audit.record({
        companyId,
        actorUserId: userId,
        eventType: AuditEventType.ACCOUNT_LOCKED,
        entityType: 'User',
        entityId: userId,
        ipAddress: ip,
      });
    }
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const session = await withoutTenantScope(() =>
      this.prisma.client.userSession.findFirst({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
        include: { user: true },
      }),
    );
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const newRefreshToken = generateOpaqueToken();
    await withoutTenantScope(() =>
      this.prisma.client.userSession.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: hashToken(newRefreshToken),
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      }),
    );

    const roles = await withoutTenantScope(() =>
      this.prisma.client.userRole.findMany({ where: { userId: session.userId } }),
    );
    const accessToken = this.signAccessToken({
      sub: session.userId,
      companyId: session.user.companyId,
      email: session.user.email,
      sessionId: session.id,
      roles: roles.map((r) => r.roleId),
      type: 'access',
    });

    return { accessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const session = await withoutTenantScope(() =>
      this.prisma.client.userSession.findFirst({
        where: { refreshTokenHash: tokenHash },
        include: { user: true },
      }),
    );
    if (!session) return; // idempotent
    await withoutTenantScope(() =>
      this.prisma.client.$transaction(async (tx) => {
        await tx.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        await this.audit.record(
          {
            companyId: session.user.companyId,
            actorUserId: session.userId,
            eventType: AuditEventType.LOGOUT,
            entityType: 'UserSession',
            entityId: session.id,
          },
          tx,
        );
      }),
    );
  }

  async revokeSession(sessionId: string, actorUserId: string, companyId: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      await this.audit.record(
        {
          companyId,
          actorUserId,
          eventType: AuditEventType.SESSION_REVOKED,
          entityType: 'UserSession',
          entityId: sessionId,
        },
        tx,
      );
    });
  }

  async requestPasswordReset(companyId: string, email: string): Promise<void> {
    await TenantContextStore.run(
      { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
      async () => {
        const user = await this.prisma.client.user.findFirst({ where: { email } });
        if (!user) return; // do not reveal whether the account exists
        const token = generateOpaqueToken();
        await this.prisma.client.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await this.emailSender.send({
          to: user.email,
          subject: 'Password reset',
          body: `Your password reset token is: ${token}`,
        });
      },
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await withoutTenantScope(() =>
      this.prisma.client.passwordResetToken.findUnique({ where: { tokenHash } }),
    );
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token.');
    }
    const passwordHash = await hashPassword(newPassword);
    await withoutTenantScope(() =>
      this.prisma.client.$transaction(async (tx) => {
        await tx.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        });
        const user = await tx.user.update({
          where: { id: record.userId },
          data: {
            passwordHash,
            failedLoginAttempts: 0,
            lockedUntil: null,
            status: UserStatus.ACTIVE,
          },
        });
        await this.audit.record(
          {
            companyId: user.companyId,
            actorUserId: user.id,
            eventType: AuditEventType.PASSWORD_RESET,
            entityType: 'User',
            entityId: user.id,
          },
          tx,
        );
      }),
    );
  }

  async enrollTotp(
    userId: string,
    accountEmail: string,
  ): Promise<{ secret: string; otpauthUri: string; backupCodes: string[] }> {
    const secret = generateTotpSecret();
    const otpauthUri = generateTotpUri(secret, accountEmail);
    const backupCodes = generateBackupCodes();

    await withoutTenantScope(() =>
      this.prisma.client.userMfa.upsert({
        where: { userId_method: { userId, method: MfaMethod.TOTP } },
        create: {
          userId,
          method: MfaMethod.TOTP,
          secretEncrypted: encryptSecret(secret, MFA_ENCRYPTION_KEY),
          enabled: false,
          backupCodesHashed: backupCodes.map(hashBackupCode),
        },
        update: {
          secretEncrypted: encryptSecret(secret, MFA_ENCRYPTION_KEY),
          enabled: false,
          backupCodesHashed: backupCodes.map(hashBackupCode),
        },
      }),
    );

    return { secret, otpauthUri, backupCodes };
  }

  async confirmTotp(userId: string, companyId: string, token: string): Promise<void> {
    const mfa = await withoutTenantScope(() =>
      this.prisma.client.userMfa.findUnique({
        where: { userId_method: { userId, method: MfaMethod.TOTP } },
      }),
    );
    if (!mfa || !mfa.secretEncrypted) throw new BadRequestException('TOTP not enrolled.');
    const secret = decryptSecret(mfa.secretEncrypted, MFA_ENCRYPTION_KEY);
    if (!verifyTotpToken(secret, token)) {
      throw new UnauthorizedException('Invalid TOTP token.');
    }
    await withoutTenantScope(() =>
      this.prisma.client.$transaction(async (tx) => {
        await tx.userMfa.update({ where: { id: mfa.id }, data: { enabled: true } });
        await this.audit.record(
          {
            companyId,
            actorUserId: userId,
            eventType: AuditEventType.MFA_ENABLED,
            entityType: 'UserMfa',
            entityId: mfa.id,
          },
          tx,
        );
      }),
    );
  }

  private async verifyMfaToken(
    mfa: { method: MfaMethod; secretEncrypted: string | null },
    token: string,
  ): Promise<boolean> {
    if (mfa.method === MfaMethod.TOTP) {
      if (!mfa.secretEncrypted) return false;
      const secret = decryptSecret(mfa.secretEncrypted, MFA_ENCRYPTION_KEY);
      return verifyTotpToken(secret, token);
    }
    // EMAIL_OTP verification against a short-lived code sent via EmailSenderPort would be
    // implemented the same way as password-reset tokens; omitted here for brevity but the
    // schema/port fully support it.
    return false;
  }

  private signAccessToken(payload: JwtAccessTokenPayload): string {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret', {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}
