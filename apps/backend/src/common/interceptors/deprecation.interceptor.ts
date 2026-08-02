import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { DEPRECATED_KEY, type DeprecatedMetadata } from '../decorators/deprecated.decorator';

/** Adds RFC 8594 `Deprecation`/`Sunset` response headers to any route marked `@Deprecated()`. */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<DeprecatedMetadata | undefined>(DEPRECATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (meta) {
      const res = context.switchToHttp().getResponse();
      res.setHeader('Deprecation', 'true');
      if (meta.sunset) {
        res.setHeader('Sunset', new Date(meta.sunset).toUTCString());
      }
    }
    return next.handle();
  }
}
