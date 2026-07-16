import type { EventBus, EventHandler } from '../index';

/**
 * Redis Streams implementation of the EventBus contract.
 * Intentionally unimplemented in the skeleton.
 */
export class RedisStreamsEventBus implements EventBus {
  publish<TPayload = unknown>(_topic: string, _payload: TPayload): Promise<void> {
    throw new Error('not implemented');
  }

  subscribe<TPayload = unknown>(
    _topic: string,
    _handler: EventHandler<TPayload>,
  ): Promise<void> {
    throw new Error('not implemented');
  }

  unsubscribe(_topic: string, _handler: EventHandler): Promise<void> {
    throw new Error('not implemented');
  }
}
