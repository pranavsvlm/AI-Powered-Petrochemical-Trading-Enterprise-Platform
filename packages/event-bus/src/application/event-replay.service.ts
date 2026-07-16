import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { Redis } from 'ioredis';
import { getSharedRedisConnection } from '../infrastructure/redis-connection';
import { EventNotFoundError } from '../domain/errors';

export interface ReplayFilter {
  eventType?: string;
  aggregateId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
}

const streamKey = (topic: string) => `events:stream:${topic}`;
const dedupKey = (consumerGroup: string, eventId: string) =>
  `events:dedup:${consumerGroup}:${eventId}`;

/**
 * Replays previously-persisted events back onto their Redis stream so subscribed consumer
 * groups reprocess them (used for POST /events/replay and POST /events/dead-letter/retry).
 * Replays are themselves recorded (EventReplay row) for auditability.
 */
export class EventReplayService {
  constructor(
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
    private readonly redis: Redis = getSharedRedisConnection(),
  ) {}

  async replay(filter: ReplayFilter, requestedById?: string) {
    const replay = await this.prisma.eventReplay.create({
      data: { filter: filter as object, requestedById, status: 'RUNNING' },
    });

    const events = await this.prisma.event.findMany({
      where: {
        eventType: filter.eventType,
        aggregateId: filter.aggregateId,
        timestamp: {
          gte: filter.fromTimestamp ? new Date(filter.fromTimestamp) : undefined,
          lte: filter.toTimestamp ? new Date(filter.toTimestamp) : undefined,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    for (const event of events) {
      const envelope = {
        eventId: event.id,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        companyId: event.companyId,
        aggregateId: event.aggregateId ?? undefined,
        timestamp: event.timestamp.toISOString(),
        source: event.source,
        correlationId: event.correlationId ?? undefined,
        payload: event.payload,
        metadata: event.metadata ?? undefined,
      };
      // An explicit, operator-triggered replay must force reprocessing even for consumer
      // groups that already successfully processed this event — that's the whole point of
      // "Event Replay" (doc 28). The idempotent-consumer dedup key exists to swallow
      // *accidental* at-least-once redelivery, not intentional replay, so it must be
      // cleared per-subscriber before the event is re-added to the stream, or every replay
      // of an already-processed event would be silently dropped until the dedup TTL expires.
      const subscriptions = await this.prisma.eventSubscription.findMany({
        where: { topic: event.eventType, isActive: true },
        select: { consumerGroup: true },
      });
      if (subscriptions.length > 0) {
        await this.redis.del(...subscriptions.map((s) => dedupKey(s.consumerGroup, event.id)));
      }
      await this.redis.xadd(streamKey(event.eventType), '*', 'envelope', JSON.stringify(envelope));
      await this.prisma.eventAudit.create({
        data: { eventId: event.id, action: 'REPLAY_EVENT', detail: { replayId: replay.id } },
      });
    }

    await this.prisma.eventReplay.update({
      where: { id: replay.id },
      data: { status: 'COMPLETED', eventsReplayed: events.length, completedAt: new Date() },
    });

    return { replayId: replay.id, eventsReplayed: events.length };
  }

  async retryDeadLetter(deadLetterId: string) {
    const dl = await this.prisma.deadLetterEvent.findUnique({
      where: { id: deadLetterId },
      include: { event: true },
    });
    if (!dl) throw new EventNotFoundError(deadLetterId);

    const envelope = {
      eventId: dl.event.id,
      eventType: dl.event.eventType,
      eventVersion: dl.event.eventVersion,
      companyId: dl.event.companyId,
      aggregateId: dl.event.aggregateId ?? undefined,
      timestamp: dl.event.timestamp.toISOString(),
      source: dl.event.source,
      correlationId: dl.event.correlationId ?? undefined,
      payload: dl.event.payload,
      metadata: dl.event.metadata ?? undefined,
    };
    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: { topic: dl.event.eventType, isActive: true },
      select: { consumerGroup: true },
    });
    if (subscriptions.length > 0) {
      await this.redis.del(...subscriptions.map((s) => dedupKey(s.consumerGroup, dl.event.id)));
    }
    await this.redis.xadd(streamKey(dl.event.eventType), '*', 'envelope', JSON.stringify(envelope));
    await this.prisma.deadLetterEvent.update({
      where: { id: dl.id },
      data: { retriedAt: new Date() },
    });
    await this.prisma.eventAudit.create({
      data: { eventId: dl.event.id, action: 'DEAD_LETTER_RETRIED', detail: {} },
    });
    return { retried: true };
  }
}
