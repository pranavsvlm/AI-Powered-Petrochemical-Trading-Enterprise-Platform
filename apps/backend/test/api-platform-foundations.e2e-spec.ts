/**
 * Batch A (docs 27) — API versioning, API Keys, rate limiting, idempotency — against a real
 * HTTP server (supertest), real Postgres/Redis. See docs/DOMAIN_MODEL_PHASE8.md.
 *
 * This is the first genuinely HTTP-layer e2e spec in this codebase (every other e2e spec calls
 * application services directly) — the app is built through the same `configureApp()` helper
 * `main.ts` uses, not a bare `Test.createTestingModule(...).createNestApplication()`, so
 * versioning/Swagger are real; ValidationPipe/GlobalExceptionFilter/DeprecationInterceptor/
 * IdempotencyInterceptor/RateLimitGuard all come for free via `app.module.ts`'s `APP_*`
 * providers, picked up automatically by `TestingModule`.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the stack in docker/docker-compose.yml.
 *
 * The rate limiter's counter lives in Redis (external, shared state — not per-test), keyed by
 * client IP + a 60s window bucket. A low limit shared across the whole file would risk tripping
 * the *other* tests' own requests, and stale counts can carry over between runs within the same
 * window. `RATE_LIMIT_PER_MINUTE` is set moderately here (comfortable headroom for this file's
 * ~10 other requests) and the burst test fires well past it concurrently, which reliably
 * produces at least one real 429 regardless of any carried-over count from a prior run.
 */
process.env.RATE_LIMIT_PER_MINUTE = '50';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { permissionCode } from '@platform/permissions';
import { PermissionAction } from '@platform/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

const API_KEY_PERMISSIONS = [
  { module: 'api-keys', action: PermissionAction.CREATE },
  { module: 'api-keys', action: PermissionAction.VIEW },
  { module: 'api-keys', action: PermissionAction.DELETE },
];

describe('API Platform Foundations (live Postgres + Redis, real HTTP)', () => {
  let app: INestApplication;
  let companyId: string;
  let userId: string;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    await withoutTenant(() =>
      Promise.all(
        API_KEY_PERMISSIONS.map((p) =>
          rawDb.permission.upsert({
            where: { code: permissionCode(p.module, p.action) },
            create: {
              code: permissionCode(p.module, p.action),
              module: p.module,
              action: p.action,
            },
            update: {},
          }),
        ),
      ),
    );

    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-EXT-${Date.now()}`,
          legalName: 'Extensibility Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Ext',
          lastName: 'Tester',
          email: `ext-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const role = await withoutTenant(() =>
      rawDb.role.create({ data: { companyId, name: 'Ext Test Role', isSystemRole: false } }),
    );
    const permissions = await withoutTenant(() =>
      rawDb.permission.findMany({
        where: { code: { in: API_KEY_PERMISSIONS.map((p) => permissionCode(p.module, p.action)) } },
      }),
    );
    await withoutTenant(() =>
      rawDb.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      }),
    );
    await withoutTenant(() => rawDb.userRole.create({ data: { userId, roleId: role.id } }));

    jwtToken = jwt.sign(
      {
        sub: userId,
        companyId,
        email: user.email,
        sessionId: 'test-session',
        roles: [role.id],
        type: 'access',
      },
      process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      { expiresIn: '1h' },
    );
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.apiKey.deleteMany({ where: { companyId } });
      await rawDb.userRole.deleteMany({ where: { userId } });
      await rawDb.rolePermission.deleteMany({ where: { role: { companyId } } });
      await rawDb.role.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await app.close();
  });

  it('serves the versioned root health check unaffected by URI versioning', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect({ status: 'ok' });
  });

  it('creates a real API key over JWT auth, then authenticates a real request using only X-Api-Key', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ name: 'CI pipeline' })
      .expect(201);

    expect(createRes.body.key).toMatch(/^nvk_/);
    expect(createRes.body.keyPrefix).toBe(createRes.body.key.slice(0, 12));
    const rawKey = createRes.body.key as string;
    const apiKeyId = createRes.body.id as string;

    // No Authorization header at all — proves TenantContextMiddleware + JwtAuthGuard's
    // X-Api-Key branch both independently resolve tenant scope and req.user correctly.
    const listRes = await request(app.getHttpServer())
      .get('/v1/api-keys')
      .set('X-Api-Key', rawKey)
      .expect(200);

    expect(listRes.body.some((k: { id: string }) => k.id === apiKeyId)).toBe(true);
    expect(listRes.body[0].keyHash).toBeUndefined();

    // Revoke over JWT, then confirm the revoked key is rejected.
    await request(app.getHttpServer())
      .delete(`/v1/api-keys/${apiKeyId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    await request(app.getHttpServer()).get('/v1/api-keys').set('X-Api-Key', rawKey).expect(401);
  });

  it('replays the identical cached response for a repeated Idempotency-Key instead of reprocessing', async () => {
    const idempotencyKey = `test-idem-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ name: 'Idempotent key' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ name: 'Idempotent key' })
      .expect(201);

    expect(second.body).toEqual(first.body);

    const listRes = await request(app.getHttpServer())
      .get('/v1/api-keys')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const matching = listRes.body.filter((k: { name: string }) => k.name === 'Idempotent key');
    expect(matching).toHaveLength(1);
  });

  it('returns a real 429 after a synthetic burst exceeds the rate limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 60; i++) {
      const res = await request(app.getHttpServer())
        .get('/v1/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
}, 60000);
