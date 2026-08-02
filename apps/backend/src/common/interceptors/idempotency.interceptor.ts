import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { getSharedRedisConnection } from '@platform/event-bus';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

const TTL_SECONDS = 24 * 60 * 60;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Opt-in via the `Idempotency-Key` request header — entirely non-breaking, a client that never
 * sends the header sees zero behavior change. Real atomic claim (`SET key PROCESSING EX ttl NX`),
 * not the non-atomic GET-then-SET the event bus's consumer-dedup uses (that one is safe only
 * because XREADGROUP consumer-group semantics already guarantee single-consumer processing —
 * raw concurrent HTTP requests need a true atomic claim). A concurrent in-flight request with the
 * same key gets a real 409; a repeat call after the first completed gets the identical cached
 * response replayed, never reprocessed.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return next.handle();
    }

    const scope = req.user?.companyId ?? req.ip ?? 'unknown';
    const redisKey = `idempotency:${scope}:${idempotencyKey}`;
    const redis = getSharedRedisConnection();

    const claimed = await redis.set(redisKey, 'PROCESSING', 'EX', TTL_SECONDS, 'NX');
    if (claimed !== 'OK') {
      const existing = await redis.get(redisKey);
      if (existing === 'PROCESSING' || existing === null) {
        throw new ConflictException(
          'A request with this idempotency key is already being processed.',
        );
      }
      const cached = JSON.parse(existing) as CachedResponse;
      res.status(cached.statusCode);
      return of(cached.body);
    }

    return next.handle().pipe(
      tap((body) => {
        const cached: CachedResponse = { statusCode: res.statusCode, body };
        void redis.set(redisKey, JSON.stringify(cached), 'EX', TTL_SECONDS);
      }),
      catchError((err) => {
        void redis.del(redisKey);
        throw err;
      }),
    );
  }
}
