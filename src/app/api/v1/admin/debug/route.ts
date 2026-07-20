/**
 * Debug endpoint — shows last 20 requests and their routing decisions.
 * GET /api/v1/admin/debug
 */
export const dynamic = "force-dynamic";

// In-memory ring buffer of recent requests
const MAX = 20;
interface TraceEntry {
  time: string;
  model: string;
  routeReason: string;
  effectiveModel: string;
  status: string;
  latencyMs: number;
  tokens: number;
}
const traces: TraceEntry[] = [];

export function addTrace(entry: Omit<TraceEntry, "time">) {
  traces.unshift({ ...entry, time: new Date().toISOString() });
  if (traces.length > MAX) traces.pop();
}

export async function GET() {
  const { prisma: maybePrisma } = await import("@/lib/prisma").catch(() => ({ prisma: null }));
  let keyHealth: any = {};
  if (maybePrisma) {
    try {
      const rows = await (maybePrisma as any).$queryRawUnsafe(
        `SELECT provider, status, COUNT(*)::int as count FROM "ProviderKey" GROUP BY provider, status`
      );
      for (const r of rows as any[]) {
        if (!keyHealth[r.provider]) keyHealth[r.provider] = {};
        keyHealth[r.provider][r.status] = r.count;
      }
    } catch {}
  }

  return Response.json({
    traces,
    keyHealth,
    processUptime: Math.round(process.uptime()),
  });
}
