import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisInstance: Redis | null = null;
let connectionAttempted = false;
let useMock = false;

export async function getRedis(): Promise<Redis | null> {
  if (connectionAttempted) return redisInstance;
  connectionAttempted = true;

  // Try real Redis first
  try {
    const redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy() { return null; },
      lazyConnect: true,
      connectTimeout: 3000,
    });
    redis.on("error", () => {});
    await redis.connect();
    console.log("[redis] real Redis connected");
    redisInstance = redis;
    return redis;
  } catch {
    console.warn("[redis] real Redis unavailable, trying in-memory fallback...");
  }

  // Redis unavailable — run without it (rate limiting disabled)
  console.warn("[redis] not available — rate limiting & caching disabled");
  redisInstance = null;
  return null;
}

export function getRedisSync(): Redis | null {
  return redisInstance;
}

export function isMockRedis(): boolean {
  return useMock;
}
