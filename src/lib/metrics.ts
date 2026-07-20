/**
 * Metrics Collector — in-memory rolling window.
 *
 * Tracks per-model, per-tier, per-language performance signals.
 * Used by the Weight Engine to auto-tune routing priorities.
 *
 * All operations are O(1) and non-blocking (no DB, no await).
 */
export interface MetricSnapshot {
  calls: number;
  successRate: number;    // 0-1
  emptyRate: number;      // fraction of calls returning empty content
  avgLatencyMs: number;
  avgTokens: number;
  lastUsedAt: number;     // epoch ms
}

interface MetricsBucket {
  calls: number;
  successes: number;
  empties: number;
  totalLatency: number;
  totalTokens: number;
  lastUsedAt: number;
}

// Key: "modelSlug|tier|lang"
const buckets = new Map<string, MetricsBucket>();
const REDIS_KEY = "metrics:routing";
let lastFlush = 0;

function key(modelSlug: string, tier: number, language: string): string {
  return `${modelSlug}|${tier}|${language}`;
}

// ── Redis persistence ──

async function getRedis() {
  try {
    const { getRedis: getR } = await import("./redis");
    return getR();
  } catch { return null; }
}

/** Flush in-memory metrics to Redis (called periodically) */
export async function flushToRedis(): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const data: Record<string, string> = {};
    for (const [k, b] of buckets) {
      if (b.calls === 0) continue;
      data[k] = JSON.stringify(b);
    }
    if (Object.keys(data).length > 0) {
      await redis.hset(REDIS_KEY, data);
      await redis.expire(REDIS_KEY, 3600); // 1h TTL
    }
    lastFlush = Date.now();
  } catch { /* silent */ }
}

/** Load metrics from Redis on startup */
export async function loadFromRedis(): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const data = await redis.hgetall(REDIS_KEY);
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        try {
          const b = JSON.parse(v as string) as MetricsBucket;
          buckets.set(k, b);
        } catch { /* skip corrupt entries */ }
      }
    }
    console.log(`[metrics] Loaded ${buckets.size} buckets from Redis`);
  } catch { /* silent */ }
}

// Auto-flush every 30s
setInterval(() => {
  if (buckets.size > 0 && Date.now() - lastFlush > 30_000) {
    flushToRedis().catch(() => {});
  }
}, 30_000).unref();

/** Record a successful call */
export function recordSuccess(
  modelSlug: string,
  tier: number,
  language: string,
  latencyMs: number,
  outputTokens: number,
  contentLength: number,
): void {
  const k = key(modelSlug, tier, language);
  const b = buckets.get(k) || { calls: 0, successes: 0, empties: 0, totalLatency: 0, totalTokens: 0, lastUsedAt: 0 };
  b.calls++;
  b.successes++;
  b.totalLatency += latencyMs;
  b.totalTokens += outputTokens;
  b.lastUsedAt = Date.now();
  if (contentLength === 0) b.empties++;
  buckets.set(k, b);
}

/** Record a failed/timed-out call */
export function recordFailure(
  modelSlug: string,
  tier: number,
  language: string,
  latencyMs: number,
): void {
  const k = key(modelSlug, tier, language);
  const b = buckets.get(k) || { calls: 0, successes: 0, empties: 0, totalLatency: 0, totalTokens: 0, lastUsedAt: 0 };
  b.calls++;
  b.totalLatency += latencyMs;
  b.lastUsedAt = Date.now();
  buckets.set(k, b);
}

/** Get snapshot for a specific model+tier+lang */
export function getSnapshot(modelSlug: string, tier: number, language: string): MetricSnapshot | null {
  const k = key(modelSlug, tier, language);
  const b = buckets.get(k);
  if (!b || b.calls === 0) return null;
  return {
    calls: b.calls,
    successRate: b.successes / b.calls,
    emptyRate: b.empties / b.calls,
    avgLatencyMs: Math.round(b.totalLatency / b.calls),
    avgTokens: Math.round(b.totalTokens / Math.max(1, b.successes)),
    lastUsedAt: b.lastUsedAt,
  };
}

/** Get all snapshots (for health check / dashboard) */
export function getAllSnapshots(): Record<string, MetricSnapshot> {
  const result: Record<string, MetricSnapshot> = {};
  for (const [k, b] of buckets) {
    if (b.calls === 0) continue;
    result[k] = {
      calls: b.calls,
      successRate: b.successes / b.calls,
      emptyRate: b.empties / b.calls,
      avgLatencyMs: Math.round(b.totalLatency / b.calls),
      avgTokens: Math.round(b.totalTokens / Math.max(1, b.successes)),
      lastUsedAt: b.lastUsedAt,
    };
  }
  return result;
}

/** Decay old buckets (call periodically, e.g. every 5 min) — halves weight of calls older than 30min */
export function decay(halflifeMs: number = 30 * 60 * 1000): void {
  const now = Date.now();
  for (const [k, b] of buckets) {
    const age = now - b.lastUsedAt;
    if (age > halflifeMs * 4) {
      buckets.delete(k); // too old, remove entirely
    } else if (age > halflifeMs) {
      // Halve the weight
      const factor = Math.pow(0.5, age / halflifeMs);
      b.calls = Math.max(1, Math.round(b.calls * factor));
      b.successes = Math.max(0, Math.round(b.successes * factor));
      b.empties = Math.max(0, Math.round(b.empties * factor));
      b.totalLatency = Math.round(b.totalLatency * factor);
      b.totalTokens = Math.round(b.totalTokens * factor);
      buckets.set(k, b);
    }
  }
}
