import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import type { JwtAccessTokenPayload } from '@platform/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Validates the JWT access token and attaches its payload to `req.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }
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
}
