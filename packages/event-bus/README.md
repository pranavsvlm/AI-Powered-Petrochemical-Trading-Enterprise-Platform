# @platform/event-bus

Pub/sub abstraction with a Redis Streams adapter stub. Kept as its own package (rather than
nested under `workflow`, as the architecture doc sketches) so it can be depended on independently
by any package/module that needs to publish or subscribe to domain events.

> Status: skeleton — `EventBus` interface only; `RedisStreamsEventBus` throws "not implemented".
