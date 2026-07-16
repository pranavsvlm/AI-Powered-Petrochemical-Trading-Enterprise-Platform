/**
 * Integration test — requires live Postgres + Redis (docker/docker-compose.yml: postgres,
 * redis). Run with DATABASE_URL and REDIS_URL pointed at them, e.g.:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/navoasis \
 *   REDIS_URL=redis://localhost:6379 \
 *   pnpm --filter @platform/event-bus test:integration
 *
 * Covers: publish -> consume (PROCESSED), publish -> repeated-failure -> dead-letter, and
 * dead-letter retry -> replay re-delivery.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import { RedisStreamsEventBus } from '../infrastructure/redis-streams.adapter';
import { EventQueryService } from '../application/event-query.service';
import { EventReplayService } from '../application/event-replay.service';

const prisma = getPrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asTenant<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Event Bus integration (live Postgres + Redis)', () => {
  const companyId = randomUUID();
  const bus = new RedisStreamsEventBus();
  const unsubscribers: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const unsub of unsubscribers) await unsub();
    await prisma.$disconnect();
  });

  it('publish -> subscribe -> consumer processes the event successfully', async () => {
    const topic = `it.success.${randomUUID()}`;
    const group = `it-group-success`;
    let received: unknown;

    const stop = await bus.subscribe(topic, group, async (envelope) => {
      received = envelope.payload;
    });
    unsubscribers.push(stop);

    const envelope = await bus.publish(topic, companyId, { hello: 'world' }, 'integration-test');

    // Poll until the consumer row is PROCESSED (bounded wait).
    let consumer;
    for (let i = 0; i < 20; i++) {
      consumer = await withoutTenant(() =>
        prisma.eventConsumer.findFirst({ where: { eventId: envelope.eventId } }),
      );
      if (consumer?.status === 'PROCESSED') break;
      await sleep(300);
    }

    expect(received).toEqual({ hello: 'world' });
    expect(consumer?.status).toBe('PROCESSED');

    const query = new EventQueryService(prisma);
    const stored = await asTenant(companyId, () => query.getById(envelope.eventId));
    expect(stored.companyId).toBe(companyId);
    expect(stored.streamMessageId).toBeTruthy();
  }, 20000);

  it('publish -> handler fails repeatedly -> exceeds maxRetries -> dead-lettered', async () => {
    const topic = `it.fail.${randomUUID()}`;
    const group = `it-group-fail`;
    let attempts = 0;

    const stop = await bus.subscribe(
      topic,
      group,
      async () => {
        attempts += 1;
        throw new Error('intentional integration-test failure');
      },
      { maxRetries: 2 },
    );
    unsubscribers.push(stop);

    const envelope = await bus.publish(topic, companyId, { boom: true }, 'integration-test');

    let deadLetter;
    for (let i = 0; i < 30; i++) {
      deadLetter = await withoutTenant(() =>
        prisma.deadLetterEvent.findFirst({ where: { eventId: envelope.eventId } }),
      );
      if (deadLetter) break;
      await sleep(500);
    }

    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(deadLetter).toBeTruthy();
    expect(deadLetter?.attempts).toBeGreaterThanOrEqual(2);

    const query = new EventQueryService(prisma);
    const list = await asTenant(companyId, () => query.deadLetter(50, 0));
    expect(list.some((d) => d.eventId === envelope.eventId)).toBe(true);
  }, 30000);

  it('dead-letter retry re-delivers the event onto the stream', async () => {
    const topic = `it.retry.${randomUUID()}`;
    const group = `it-group-retry`;
    let successfulAttempts = 0;
    let shouldFail = true;

    const stop = await bus.subscribe(
      topic,
      group,
      async () => {
        if (shouldFail) throw new Error('fail once');
        successfulAttempts += 1;
      },
      { maxRetries: 1 },
    );
    unsubscribers.push(stop);

    const envelope = await bus.publish(topic, companyId, { retry: true }, 'integration-test');

    let deadLetter;
    for (let i = 0; i < 20; i++) {
      deadLetter = await withoutTenant(() =>
        prisma.deadLetterEvent.findFirst({ where: { eventId: envelope.eventId } }),
      );
      if (deadLetter) break;
      await sleep(300);
    }
    expect(deadLetter).toBeTruthy();

    // Flip the handler to succeed, then retry the dead letter.
    shouldFail = false;
    const replay = new EventReplayService(prisma);
    const result = await asTenant(companyId, () => replay.retryDeadLetter(deadLetter!.id));
    expect(result.retried).toBe(true);

    for (let i = 0; i < 20; i++) {
      if (successfulAttempts >= 1) break;
      await sleep(300);
    }
    expect(successfulAttempts).toBeGreaterThanOrEqual(1);

    const updated = await withoutTenant(() =>
      prisma.deadLetterEvent.findUnique({ where: { id: deadLetter!.id } }),
    );
    expect(updated?.retriedAt).toBeTruthy();
  }, 30000);

  it('replay re-delivers events matching a filter', async () => {
    const topic = `it.replay.${randomUUID()}`;
    let count = 0;
    const stop = await bus.subscribe(topic, 'it-group-replay', async () => {
      count += 1;
    });
    unsubscribers.push(stop);

    await bus.publish(topic, companyId, { n: 1 }, 'integration-test');
    for (let i = 0; i < 20 && count < 1; i++) await sleep(300);
    expect(count).toBeGreaterThanOrEqual(1);

    const replay = new EventReplayService(prisma);
    const result = await asTenant(companyId, () => replay.replay({ eventType: topic }));
    expect(result.eventsReplayed).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 20 && count < 2; i++) await sleep(300);
    expect(count).toBeGreaterThanOrEqual(2);
  }, 20000);
});
