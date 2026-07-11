import { getRedisSync } from "./redis";

interface RateCheckInput {
  userId: string;
  trustLevel: string;
}

const LIMITS: Record<string, { rpm: number; tpm5min: number }> = {
  L0: { rpm: 20, tpm5min: 100_000 },
  L1: { rpm: 100, tpm5min: 500_000 },
  L2: { rpm: 500, tpm5min: 2_000_000 },
  L3: { rpm: 5000, tpm5min: 20_000_000 },
};

export async function checkRateLimit(input: RateCheckInput): Promise<{ allowed: boolean; reason?: string }> {
  const redis = getRedisSync();
  if (!redis) return { allowed: true }; // no Redis → skip rate limiting

  const limits = LIMITS[input.trustLevel] || LIMITS.L0;
  const now = Date.now();
  const minuteKey = `ratelimit:${input.userId}:minute:${Math.floor(now / 60000)}`;

  try {
    const count = await redis.incr(minuteKey);
    redis.expire(minuteKey, 60).catch(() => {});

    if (count > limits.rpm) {
      return { allowed: false, reason: `Rate limit exceeded: ${limits.rpm} requests/min (${input.trustLevel})` };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // Redis error → allow through
  }
}

export async function recordTokenUsage(userId: string, tokens: number) {
  const redis = getRedisSync();
  if (!redis) return;

  try {
    const fiveMinKey = `ratelimit:${userId}:5min`;
    await redis.incrby(fiveMinKey, Math.floor(tokens));
    redis.expire(fiveMinKey, 300).catch(() => {});
  } catch {
    // silently skip
  }
}
