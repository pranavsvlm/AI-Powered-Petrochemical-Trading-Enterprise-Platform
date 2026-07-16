// Pub/sub abstraction — transport-agnostic contract only, no implementation.
export const PACKAGE_NAME = '@platform/event-bus';

export type EventHandler<TPayload = unknown> = (payload: TPayload) => void | Promise<void>;

export interface EventBus {
  publish<TPayload = unknown>(topic: string, payload: TPayload): Promise<void>;
  subscribe<TPayload = unknown>(topic: string, handler: EventHandler<TPayload>): Promise<void>;
  unsubscribe(topic: string, handler: EventHandler): Promise<void>;
}
