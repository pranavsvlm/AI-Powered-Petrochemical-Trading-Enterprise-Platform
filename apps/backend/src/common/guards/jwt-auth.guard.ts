import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { hashToken } from '@platform/auth';
import { withoutTenantScope } from '@platform/database';
import type { JwtAccessTokenPayload } from '@platform/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Validates either a JWT access token (`Authorization: Bearer`) or a real API key
 * (`X-Api-Key`) and attaches a `JwtAccessTokenPayload`-shaped object to `req.user` either way —
 * every existing controller's `@RequirePermission`/`PermissionsGuard` downstream works
 * unchanged since it only reads `req.user.roles`. An API key authenticates AS its owning user
 * and inherits that user's real, current RBAC roles (re-queried fresh, same as the JWT path
 * never trusts anything beyond role IDs from the token itself).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret');
        if (typeof decoded !== 'object' || decoded.type !== 'access') {
          throw new UnauthorizedException('Invalid token type.');
        }
        req.user = decoded as JwtAccessTokenPayload;
        return true;
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException('Invalid or expired access token.');
      }
    }

    const apiKeyHeader = req.headers['x-api-key'] as string | string[] | undefined;
    const rawKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (rawKey) {
      return this.authenticateApiKey(rawKey, req);
    }

    throw new UnauthorizedException('Missing bearer token or API key.');
  }

  private async authenticateApiKey(rawKey: string, req: Record<string, unknown>): Promise<boolean> {
    const keyHash = hashToken(rawKey);
    const apiKey = await withoutTenantScope(() =>
      this.prisma.client.apiKey.findUnique({ where: { keyHash } }),
    );
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }

    const roleRows = await withoutTenantScope(() =>
      this.prisma.client.userRole.findMany({ where: { userId: apiKey.userId } }),
    );
    const user = await withoutTenantScope(() =>
      this.prisma.client.user.findUnique({ where: { id: apiKey.userId } }),
    );
    if (!user) {
      throw new UnauthorizedException('API key user no longer exists.');
    }

    req.user = {
      sub: apiKey.userId,
      companyId: apiKey.companyId,
      email: user.email,
      sessionId: apiKey.id,
      roles: roleRows.map((r) => r.roleId),
      type: 'access',
    } satisfies JwtAccessTokenPayload;

    withoutTenantScope(() =>
      this.prisma.client.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }),
    ).catch(() => {
      // best-effort bookkeeping only — never fail the request over this
    });

    return true;
  }
}
