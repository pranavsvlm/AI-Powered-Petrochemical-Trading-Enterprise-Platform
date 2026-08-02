import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { TenantContextStore } from '@platform/core';
import { hashToken } from '@platform/auth';
import { withoutTenantScope } from '@platform/database';
import type { JwtAccessTokenPayload } from '@platform/types';
import { PrismaService } from '../../prisma/prisma.service';

interface ResolvedIdentity {
  companyId: string | null;
  userId: string | null;
  sessionId: string | null;
}

/**
 * Resolves company_id/userId from the validated JWT access token OR a real `X-Api-Key` header
 * (if present) and binds an AsyncLocalStorage-based tenant context for the lifetime of the
 * request. Runs before route guards so every downstream Prisma query (via the tenant extension)
 * is scoped. A guard cannot fix tenant scoping after the fact — `TenantContextStore.run()`'s
 * binding doesn't survive past the callback that invoked it — so the API-key resolution has to
 * happen here too, not just in `JwtAuthGuard`. This mirrors the existing convention that this
 * middleware and `JwtAuthGuard` already both independently verify the same Bearer token.
 * Requests without a valid token/key simply get an empty context — the guard is responsible for
 * rejecting unauthenticated requests to protected routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const identity = await this.resolveIdentity(req);

    TenantContextStore.run(
      {
        companyId: identity.companyId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        ipAddress: req.ip ?? null,
        isPlatformActor: false,
      },
      () => next(),
    );
  }

  private async resolveIdentity(req: Request): Promise<ResolvedIdentity> {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret');
        if (typeof decoded === 'object' && decoded.type === 'access') {
          const payload = decoded as JwtAccessTokenPayload;
          return {
            companyId: payload.companyId,
            userId: payload.sub,
            sessionId: payload.sessionId,
          };
        }
      } catch {
        // invalid/expired token — fall through to empty context, guard will reject
      }
      return { companyId: null, userId: null, sessionId: null };
    }

    const apiKeyHeader = req.headers['x-api-key'];
    const rawKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (rawKey) {
      const keyHash = hashToken(rawKey);
      const apiKey = await withoutTenantScope(() =>
        this.prisma.client.apiKey.findUnique({ where: { keyHash } }),
      );
      if (apiKey && !apiKey.revokedAt) {
        return { companyId: apiKey.companyId, userId: apiKey.userId, sessionId: apiKey.id };
      }
    }

    return { companyId: null, userId: null, sessionId: null };
  }
}
