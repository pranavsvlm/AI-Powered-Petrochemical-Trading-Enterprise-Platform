import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { getSharedRedisConnection } from '@platform/event-bus';

/**
 * Global, IP-keyed fixed-window rate limiter — registered as an `APP_GUARD` in `app.module.ts`
 * so it covers every route, including pre-auth ones like login, with zero per-controller
 * changes. IP-keyed (not company/user-keyed) because global guards run BEFORE controller-level
 * guards in Nest's pipeline, so `req.user` isn't populated yet when this runs. Env-configurable
 * (`RATE_LIMIT_PER_MINUTE`), generous default so normal interactive/test traffic never trips it.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300);
  private readonly windowSeconds = 60;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const windowBucket = Math.floor(Date.now() / (this.windowSeconds * 1000));
    const key = `ratelimit:${ip}:${windowBucket}`;

    const redis = getSharedRedisConnection();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, this.windowSeconds);
    }

    if (count > this.limit) {
      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
