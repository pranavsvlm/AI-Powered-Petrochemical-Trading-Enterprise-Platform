import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { TenantContextStore } from '@platform/core';
import type { JwtAccessTokenPayload } from '@platform/types';

/**
 * Resolves company_id/userId from the validated JWT access token (if present) and binds
 * an AsyncLocalStorage-based tenant context for the lifetime of the request. Runs before
 * route guards so every downstream Prisma query (via the tenant extension) is scoped.
 * Requests without a valid token simply get an empty context — JwtAuthGuard is responsible
 * for rejecting unauthenticated requests to protected routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    let payload: JwtAccessTokenPayload | null = null;

    if (header?.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret');
        if (typeof decoded === 'object' && decoded.type === 'access') {
          payload = decoded as JwtAccessTokenPayload;
        }
      } catch {
        payload = null; // invalid/expired token — leave context empty, guard will reject
      }
    }

    TenantContextStore.run(
      {
        companyId: payload?.companyId ?? null,
        userId: payload?.sub ?? null,
        sessionId: payload?.sessionId ?? null,
        ipAddress: req.ip ?? null,
        isPlatformActor: false,
      },
      () => next(),
    );
  }
}
