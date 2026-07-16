import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { EventEnvelope, PublishOptions } from '../domain/event-envelope';
import { computeBackoffMs, hasExceededMaxRetries } from '../domain/backoff';
import { EventNotFoundError } from '../domain/errors';
import { createRedisConnection, getSharedRedisConnection } from './redis-connection';

export type EventHandler<TPayload = unknown> = (
  envelope: EventEnvelope<TPayload>,
) => void | Promise<void>;

interface Subscription {
  topic: string;
  consumerGroup: string;
  handler: EventHandler;
  companyId?: string;
  maxRetries: number;
  stop: () => Promise<void>;
}

const DEDUP_TTL_SECONDS = 24 * 60 * 60;
const streamKey = (topic: string) => `events:stream:${topic}`;
const dedupKey = (consumerGroup: string, eventId: string) =>
  `events:dedup:${consumerGroup}:${eventId}`;

/**
 * Real Redis-Streams-backed EventBus. Every publish is persisted (Event row) before the
 * XADD so GET /events and replay always have a durable source of truth even if Redis is
 * flushed. Consumers use XREADGROUP consumer groups for at-least-once delivery, a Redis
 * SET (NX + TTL) for idempotent-consumer dedup, exponential backoff retry, and move an
 * event's per-subscription EventConsumer row + a DeadLetterEvent row to DEAD_LETTERED
 * once max retries are exceeded (after which XACK removes it from the pending list).
 */
export class RedisStreamsEventBus {
  private readonly redis: Redis;
  private readonly prisma: TenantScopedPrismaClient;
  private readonly subscriptions: Subscription[] = [];

  constructor(redis: Redis = getSharedRedisConnection(), prisma = getPrismaClient()) {
    this.redis = redis;
    this.prisma = prisma;
  }

  async publish<TPayload = unknown>(
    topic: string,
    companyId: string,
    payload: TPayload,
    source: string,
    options: PublishOptions = {},
  ): Promise<EventEnvelope<TPayload>> {
    const envelope: EventEnvelope<TPayload> = {
      eventId: randomUUID(),
      eventType: topic,
      eventVersion: options.eventVersion ?? 1,
      companyId,
      aggregateId: options.aggregateId,
      timestamp: new Date().toISOString(),
      source,
      correlationId: options.correlationId ?? randomUUID(),
      payload,
      metadata: options.metadata,
    };

    const prisma = this.prisma;
    await TenantContextStore.run(
      { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
      async () => {
        await prisma.event.create({
          data: {
            id: envelope.eventId,
            eventType: envelope.eventType,
            eventVersion: envelope.eventVersion,
            companyId: envelope.companyId,
            aggregateId: envelope.aggregateId,
            timestamp: new Date(envelope.timestamp),
            source: envelope.source,
            correlationId: envelope.correlationId,
            payload: envelope.payload as object,
            metadata: (envelope.metadata ?? undefined) as object | undefined,
            status: 'PENDING',
          },
        });
      },
    );

    const streamId = await this.redis.xadd(
      streamKey(topic),
      '*',
      'envelope',
      JSON.stringify(envelope),
    );

    await this.withoutTenant(() =>
      this.prisma.event.update({
        where: { id: envelope.eventId },
        data: { streamMessageId: streamId ?? undefined },
      }),
    );
    await this.audit(envelope.eventId, 'PUBLISHED', { topic });

    return envelope;
  }

  /**
   * Subscribes `handler` to `topic` under `consumerGroup` (creates the Redis consumer
   * group + an EventSubscription row if missing) and starts a polling XREADGROUP loop.
   * If `companyId` is provided, events for other companies are never dispatched to the
   * handler (defense-in-depth on top of the fact that most topics are already
   * company-scoped by publisher) — this satisfies "consumers must not cross tenants".
   */
  async subscribe<TPayload = unknown>(
    topic: string,
    consumerGroup: string,
    handler: EventHandler<TPayload>,
    opts: { companyId?: string; maxRetries?: number; blockMs?: number } = {},
  ): Promise<() => Promise<void>> {
    const key = streamKey(topic);
    try {
      await this.redis.xgroup('CREATE', key, consumerGroup, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }

    await this.withoutTenant(() =>
      this.prisma.eventSubscription.upsert({
        where: { topic_consumerGroup: { topic, consumerGroup } },
        create: {
          topic,
          consumerGroup,
          handlerName: handler.name || 'anonymous',
          companyId: opts.companyId,
          maxRetries: opts.maxRetries ?? 5,
        },
        update: { isActive: true },
      }),
    );

    const maxRetries = opts.maxRetries ?? 5;
    const consumerName = `${consumerGroup}-${process.pid}-${randomUUID().slice(0, 8)}`;
    const loopConnection = createRedisConnection();
    let running = true;

    const loop = async () => {
      while (running) {
        let results;
        try {
          results = await loopConnection.xreadgroup(
            'GROUP',
            consumerGroup,
            consumerName,
            'COUNT',
            10,
            'BLOCK',
            opts.blockMs ?? 2000,
            'STREAMS',
            key,
            '>',
          );
        } catch {
          if (!running) return;
          await sleep(500);
          continue;
        }
        if (!results) continue;

        for (const [, messages] of results as [string, [string, string[]][]][]) {
          for (const [messageId, fields] of messages) {
            await this.handleMessage(
              topic,
              consumerGroup,
              messageId,
              fields,
              handler as EventHandler,
              maxRetries,
              opts.companyId,
            );
          }
        }
      }
    };

    void loop();

    const stop = async () => {
      running = false;
      await loopConnection.quit();
    };
    this.subscriptions.push({
      topic,
      consumerGroup,
      handler: handler as EventHandler,
      companyId: opts.companyId,
      maxRetries,
      stop,
    });
    return stop;
  }

  async unsubscribe(topic: string, consumerGroup: string): Promise<void> {
    const idx = this.subscriptions.findIndex(
      (s) => s.topic === topic && s.consumerGroup === consumerGroup,
    );
    if (idx >= 0) {
      await this.subscriptions[idx]!.stop();
      this.subscriptions.splice(idx, 1);
    }
  }

  private async handleMessage(
    topic: string,
    consumerGroup: string,
    messageId: string,
    fields: string[],
    handler: EventHandler,
    maxRetries: number,
    scopedCompanyId: string | undefined,
  ): Promise<void> {
    const envelopeIdx = fields.indexOf('envelope');
    const raw = envelopeIdx >= 0 ? fields[envelopeIdx + 1] : undefined;
    if (!raw) {
      await this.redis.xack(streamKey(topic), consumerGroup, messageId);
      return;
    }
    const envelope = JSON.parse(raw) as EventEnvelope;

    if (scopedCompanyId && envelope.companyId !== scopedCompanyId) {
      // Never dispatch cross-tenant; ack so it doesn't block the group's PEL forever.
      await this.redis.xack(streamKey(topic), consumerGroup, messageId);
      return;
    }

    // Idempotent-consumer dedup is keyed on eventId and only ever SET after a message has
    // been fully, successfully processed (see below) — NOT pre-emptively before an attempt.
    // Setting it up-front would permanently block any later retry or explicit replay/
    // dead-letter-retry of the same eventId, since replay re-delivers the identical eventId
    // on a brand-new stream message. XREADGROUP consumer groups already guarantee at most
    // one consumer in the group is ever handling a given *stream message* concurrently, so
    // this key's only job is cross-message (replay) dedup of already-completed work.
    const dedupSetKey = dedupKey(consumerGroup, envelope.eventId);
    const alreadyProcessed = await this.redis.get(dedupSetKey);
    if (alreadyProcessed) {
      await this.redis.xack(streamKey(topic), consumerGroup, messageId);
      return;
    }

    const subscription = await this.withoutTenant(() =>
      this.prisma.eventSubscription.findUnique({
        where: { topic_consumerGroup: { topic, consumerGroup } },
      }),
    );
    if (!subscription) return;

    const eventRow = await this.withoutTenant(() =>
      this.prisma.event.findUnique({ where: { id: envelope.eventId } }),
    );
    if (!eventRow) throw new EventNotFoundError(envelope.eventId);

    // Retries are driven by an in-process loop with exponential backoff rather than by
    // relying on Redis Streams re-delivery: XREADGROUP's '>' read semantics only ever
    // deliver a message to a consumer group ONCE (never-delivered-before entries) — an
    // unacked-but-failed message is NOT automatically re-handed to the reading loop on its
    // next poll, so a retry has to happen here, not by returning and hoping the stream
    // re-delivers it.
    let attempts = 0;
    let lastError = '';
    for (;;) {
      attempts += 1;
      const consumerRow = await this.withoutTenant(() =>
        this.prisma.eventConsumer.upsert({
          where: {
            subscriptionId_eventId: { subscriptionId: subscription.id, eventId: envelope.eventId },
          },
          create: {
            subscriptionId: subscription.id,
            eventId: envelope.eventId,
            status: 'PROCESSING',
            attempts,
          },
          update: { status: 'PROCESSING', attempts, lastAttemptAt: new Date() },
        }),
      );

      const start = Date.now();
      try {
        await handler(envelope);
        const durationMs = Date.now() - start;
        await this.withoutTenant(() =>
          this.prisma.eventConsumer.update({
            where: { id: consumerRow.id },
            data: { status: 'PROCESSED', processedAt: new Date(), processingTimeMs: durationMs },
          }),
        );
        await this.audit(envelope.eventId, 'CONSUMED', { consumerGroup, durationMs, attempts });
        // Only mark dedup once processing has genuinely succeeded.
        await this.redis.set(dedupSetKey, '1', 'EX', DEDUP_TTL_SECONDS);
        await this.redis.xack(streamKey(topic), consumerGroup, messageId);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await this.audit(envelope.eventId, 'FAILED', { consumerGroup, attempts, error: lastError });

        if (hasExceededMaxRetries(attempts, maxRetries)) {
          await this.withoutTenant(async () => {
            await this.prisma.eventConsumer.update({
              where: { id: consumerRow.id },
              data: { status: 'DEAD_LETTERED', lastError },
            });
            await this.prisma.deadLetterEvent.create({
              data: {
                eventId: envelope.eventId,
                subscriptionId: subscription.id,
                reason: `Exceeded ${maxRetries} retries`,
                attempts,
                lastError,
              },
            });
          });
          await this.audit(envelope.eventId, 'DEAD_LETTER_CREATED', { consumerGroup, attempts });
          // Ack so a dead-lettered message doesn't block group progress; retry happens via
          // the explicit replay API (which re-publishes a fresh stream message), not by
          // leaving this one pending forever.
          await this.redis.xack(streamKey(topic), consumerGroup, messageId);
          return;
        }

        await this.withoutTenant(() =>
          this.prisma.eventConsumer.update({
            where: { id: consumerRow.id },
            data: { status: 'FAILED', lastError },
          }),
        );
        await sleep(computeBackoffMs(attempts));
        // Loop and retry in-process; the message is intentionally left un-acked in Redis
        // until we reach a terminal (PROCESSED or DEAD_LETTERED) outcome above.
      }
    }
  }

  private async audit(eventId: string, action: string, detail: Record<string, unknown>) {
    await this.withoutTenant(() =>
      this.prisma.eventAudit.create({ data: { eventId, action, detail: detail as object } }),
    );
  }

  private async withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
    // `fn` must be awaited *inside* the AsyncLocalStorage-bound callback — see the
    // withoutTenantScope() doc comment in packages/database/src/tenant-extension.ts for why
    // a bare `fn` reference here silently loses the bound tenant context.
    return TenantContextStore.run(
      { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
      async () => await fn(),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
