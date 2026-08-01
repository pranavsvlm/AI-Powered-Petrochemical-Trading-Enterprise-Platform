export const PACKAGE_NAME = '@platform/event-bus';

export type { EventEnvelope, PublishOptions } from './domain/event-envelope';
export { EVENT_TYPES } from './domain/event-catalog';
export type { EventTypeName } from './domain/event-catalog';
export type { TaskGenerationRequestedPayload } from './domain/event-payloads';
export { EventBusError, TenantMismatchError, EventNotFoundError } from './domain/errors';
export { computeBackoffMs, hasExceededMaxRetries } from './domain/backoff';

export { RedisStreamsEventBus } from './infrastructure/redis-streams.adapter';
export type { EventHandler } from './infrastructure/redis-streams.adapter';
export { getSharedRedisConnection, createRedisConnection } from './infrastructure/redis-connection';

export { EventQueryService } from './application/event-query.service';
export type { EventListFilter } from './application/event-query.service';
export { EventReplayService } from './application/event-replay.service';
export type { ReplayFilter } from './application/event-replay.service';
