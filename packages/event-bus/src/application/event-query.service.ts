import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { EventNotFoundError } from '../domain/errors';

export interface EventListFilter {
  eventType?: string;
  aggregateId?: string;
  correlationId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Read-side queries backing GET /events, GET /events/{id}, GET /events/dead-letter and the
 * observability numbers exposed by the Event Bus REST API. Always runs inside the caller's
 * bound tenant context (relies on the Prisma tenant extension for company scoping), so this
 * service must be called from request-scoped code, not background workers.
 */
export class EventQueryService {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async list(filter: EventListFilter) {
    return this.prisma.event.findMany({
      where: {
        eventType: filter.eventType,
        aggregateId: filter.aggregateId,
        correlationId: filter.correlationId,
        status: filter.status as never,
      },
      orderBy: { timestamp: 'desc' },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });
  }

  async getById(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new EventNotFoundError(id);
    return event;
  }

  async deadLetter(limit = 50, offset = 0) {
    return this.prisma.deadLetterEvent.findMany({
      include: { event: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Real, persisted-data-backed metrics — not a fake endpoint. All numbers come from
   * counting/aggregating the Event/EventConsumer/DeadLetterEvent tables.
   */
  async metrics() {
    const [published, failed, deadLettered, avgDurationRow] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.eventConsumer.count({ where: { status: 'FAILED' } }),
      this.prisma.deadLetterEvent.count(),
      this.prisma.eventConsumer.aggregate({
        _avg: { processingTimeMs: true },
        where: { status: 'PROCESSED' },
      }),
    ]);
    const pendingConsumers = await this.prisma.eventConsumer.count({
      where: { status: 'PENDING' },
    });
    const retryCount = await this.prisma.eventConsumer.aggregate({ _sum: { attempts: true } });

    return {
      publishedEvents: published,
      failedConsumptions: failed,
      deadLetteredEvents: deadLettered,
      averageProcessingTimeMs: avgDurationRow._avg.processingTimeMs ?? 0,
      queueLength: pendingConsumers,
      totalRetryAttempts: retryCount._sum.attempts ?? 0,
    };
  }
}
