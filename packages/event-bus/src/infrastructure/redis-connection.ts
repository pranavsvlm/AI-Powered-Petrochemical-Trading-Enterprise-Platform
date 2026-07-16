import Redis from 'ioredis';

let sharedConnection: Redis | undefined;

/**
 * Single shared ioredis connection for the event bus package, built from REDIS_URL.
 * A separate connection is required for blocking XREADGROUP calls per consumer loop —
 * callers that need to block should call createRedisConnection() instead of using the
 * shared non-blocking connection (used for XADD/XACK/SET etc.).
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(url, { maxRetriesPerRequest: null });
}
