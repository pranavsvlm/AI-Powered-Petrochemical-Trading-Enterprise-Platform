import { INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * The handful of things Nest genuinely cannot express as DI-registered providers — API
 * versioning and the Swagger document have no `APP_*` token equivalent, so they must be applied
 * imperatively. Extracted here (rather than left inline in `main.ts`) so the e2e HTTP test suite
 * builds an app that behaves identically to production instead of silently missing them.
 * Everything else (ValidationPipe, GlobalExceptionFilter, DeprecationInterceptor,
 * IdempotencyInterceptor, RateLimitGuard) is registered as an `APP_PIPE`/`APP_FILTER`/
 * `APP_INTERCEPTOR`/`APP_GUARD` provider in `app.module.ts` instead, so `TestingModule` picks
 * those up automatically via DI with no risk of drift.
 */
export function configureApp(app: INestApplication): void {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NavOasis API')
    .setDescription(
      'Doc 27 — API & Integration Platform. Authenticate with a Bearer JWT or an X-Api-Key header.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'X-Api-Key')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);
}
