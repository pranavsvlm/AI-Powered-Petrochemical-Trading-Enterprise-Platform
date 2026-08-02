/**
 * Batch C (doc 30) — the real, scoped-down Developer Platform surface: a real health check
 * (real DB + Redis connectivity, no auth) and a real version endpoint (auth-only, no permission
 * check). See docs/DOMAIN_MODEL_PHASE8.md. Everything else doc 30 asks for is deferred — no real
 * CD pipeline exists in this repo to instrument.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the stack in docker/docker-compose.yml.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

describe('Developer endpoints (live Postgres + Redis, real HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/developer/health is real and public — no auth required', async () => {
    const res = await request(app.getHttpServer()).get('/v1/developer/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok', redis: 'ok' });
  });

  it('GET /v1/developer/version requires auth and returns a real version/gitSha', async () => {
    await request(app.getHttpServer()).get('/v1/developer/version').expect(401);

    const token = jwt.sign(
      {
        sub: 'test-user',
        companyId: 'test-company',
        email: 'x@test.local',
        sessionId: 'test-session',
        roles: [],
        type: 'access',
      },
      process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      { expiresIn: '1h' },
    );

    const res = await request(app.getHttpServer())
      .get('/v1/developer/version')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.gitSha).toBe('string');
  });
}, 60000);
