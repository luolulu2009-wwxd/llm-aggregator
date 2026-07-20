/**
 * Health check — returns provider availability for monitoring and auto-fallback.
 *
 * GET /health  → 200 if at least one provider is viable, 503 if all dead
 */
export const dynamic = "force-dynamic";
import { getAllCircuits } from "@/lib/circuit";
import { listAdapters } from "@/lib/adapters/factory";
import { getAllSnapshots } from "@/lib/metrics";
import { decay } from "@/lib/metrics";

export async function GET() {
  const circuits = getAllCircuits();
  const adapters = listAdapters();

  // Providers without any circuit state are assumed healthy
  const providerStatus: Record<string, "healthy" | "degraded" | "open"> = {};
  for (const p of adapters) {
    const c = circuits[p];
    if (!c) {
      providerStatus[p] = "healthy";
    } else if (c.open) {
      providerStatus[p] = "open";
    } else if (c.failures > 0) {
      providerStatus[p] = "degraded";
    } else {
      providerStatus[p] = "healthy";
    }
  }

  const healthyCount = Object.values(providerStatus).filter(s => s !== "open").length;
  const status = healthyCount > 0 ? 200 : 503;

  // Decay stale metrics
  decay();

  // Key health: check if provider keys are working
  const { prisma } = await import("@/lib/prisma").catch(() => ({ prisma: null }));
  let keyHealth: Record<string, { total: number; active: number }> = {};
  if (prisma) {
    try {
      const keyCounts = await prisma.$queryRawUnsafe<Array<{ provider: string; status: string; count: bigint }>>(
        `SELECT provider, status, COUNT(*) as count FROM "ProviderKey" GROUP BY provider, status`
      );
      for (const r of keyCounts) {
        if (!keyHealth[r.provider]) keyHealth[r.provider] = { total: 0, active: 0 };
        keyHealth[r.provider].total += Number(r.count);
        if (r.status === "active") keyHealth[r.provider].active += Number(r.count);
      }
    } catch { /* DB might not be available */ }
  }

  return Response.json({
    status: status === 200 ? "ok" : "down",
    providers: providerStatus,
    keyHealth,
    circuits,
    metrics: getAllSnapshots(),
    uptime: process.uptime(),
  }, { status });
}
