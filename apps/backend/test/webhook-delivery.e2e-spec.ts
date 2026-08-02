/**
 * Real webhook dispatch (doc 27) against real Postgres + Redis — see
 * docs/DOMAIN_MODEL_PHASE8.md, Batch B. Publishes a real `ORDER_CREATED` event through the real
 * `RedisStreamsEventBus`, runs the real `registerWebhookDispatchSubscriber`, and asserts a real
 * external HTTP receiver (a local `http.createServer()`) actually receives a correctly
 * HMAC-signed POST — not just that a `WebhookDelivery` row gets written.
 *
 * Requires DATABASE_URL and REDIS_URL to point at the stack in docker/docker-compose.yml.
 */
import { createServer, type Server } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { EVENT_TYPES, RedisStreamsEventBus } from '@platform/event-bus';
import {
  PluginService,
  WebhookService,
  registerWebhookDispatchSubscriber,
} from '@modules/extensibility';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Webhook dispatch: real ORDER_CREATED delivery (live Postgres + Redis)', () => {
  let companyId: string;
  let userId: string;
  let receiver: Server;
  let receiverUrl: string;
  let unsubscribe: () => Promise<void>;
  let webhookSecret: string;
  const received: Array<{ headers: Record<string, string>; body: string }> = [];

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers as Record<string, string>, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, resolve));
    const port = (receiver.address() as AddressInfo).port;
    receiverUrl = `http://127.0.0.1:${port}/hook`;

    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-WHDEL-${Date.now()}`,
          legalName: 'Webhook Delivery Test Co',
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
          firstName: 'Webhook',
          lastName: 'Tester',
          email: `webhook-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const audit = { record: async () => {} };
    const pluginService = new PluginService(db, audit);
    const webhookService = new WebhookService(db, pluginService, audit);

    await asCompany(companyId, userId, () => pluginService.install(companyId, 'webhooks', userId));
    await asCompany(companyId, userId, () => pluginService.activate(companyId, 'webhooks', userId));

    const webhook = await asCompany(companyId, userId, () =>
      webhookService.create(companyId, receiverUrl, ['OrderCreated'], userId),
    );
    webhookSecret = webhook.secret;

    const eventBus = new RedisStreamsEventBus();
    unsubscribe = await registerWebhookDispatchSubscriber(eventBus, db);

    const orderId = randomUUID();
    await eventBus.publish(
      EVENT_TYPES.ORDER_CREATED,
      companyId,
      { orderId, totalAmount: '4200.00' },
      'orders',
    );

    for (let i = 0; i < 20; i++) {
      if (received.length > 0) break;
      await sleep(300);
    }
  }, 30000);

  afterAll(async () => {
    await unsubscribe();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
    await withoutTenant(async () => {
      await rawDb.webhookDelivery.deleteMany({ where: { companyId } });
      await rawDb.webhook.deleteMany({ where: { companyId } });
      await rawDb.pluginInstall.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('delivers a real, correctly HMAC-signed HTTP POST to the external receiver', () => {
    expect(received).toHaveLength(1);
    const [delivery] = received;
    expect(delivery.headers['x-navoasis-event']).toBe('OrderCreated');

    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(delivery.body)
      .digest('hex');
    expect(delivery.headers['x-navoasis-signature']).toBe(`sha256=${expectedSignature}`);

    const parsed = JSON.parse(delivery.body);
    expect(parsed.eventType).toBe('OrderCreated');
    expect(parsed.payload.totalAmount).toBe('4200.00');
  }, 20000);

  it('records a real SUCCEEDED WebhookDelivery row', async () => {
    const deliveries = await withoutTenant(() =>
      rawDb.webhookDelivery.findMany({ where: { companyId } }),
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe('SUCCEEDED');
    expect(deliveries[0].responseStatusCode).toBe(200);
  });
});
