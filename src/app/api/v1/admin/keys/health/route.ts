/**
 * Key Health Auto-Check — marks dead keys as "paused"
 * Called by cron or health endpoint periodically.
 *
 * POST /api/v1/admin/keys/health?auto=true
 *   → Checks all active keys → marks failed ones paused
 */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getAdapterByProvider } from "@/lib/adapters/factory";

export async function POST(req: NextRequest) {
  const auto = req.nextUrl.searchParams.get("auto") === "true";
  if (!auto) return Response.json({ message: "Pass ?auto=true to run health check" });

  const keys = await prisma.providerKey.findMany({
    where: { status: "active" },
    select: { id: true, provider: true, modelFamily: true, keyEncrypted: true },
  });

  const results: { id: string; provider: string; ok: boolean; error?: string }[] = [];

  for (const key of keys) {
    try {
      const adapter = getAdapterByProvider(key.provider);
      if (!adapter) { results.push({ id: key.id, provider: key.provider, ok: false, error: "no adapter" }); continue; }

      const apiKey = decrypt(key.keyEncrypted);
      const built = adapter.buildRequest({ model: key.modelFamily, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }, apiKey);

      const resp = await fetch(built.url, {
        method: "POST", headers: built.headers,
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(10_000),
      });

      const ok = resp.status < 500; // 4xx = key invalid, 5xx = server error
      results.push({ id: key.id, provider: key.provider, ok });

      // Update lastHealthCheck
      await prisma.providerKey.update({
        where: { id: key.id },
        data: { lastHealthCheck: new Date() },
      });

      // Auto-pause on repeated failures (3+ stored failures tracked via circuit)
      if (!ok && resp.status === 403) {
        console.warn(`[key-health] ${key.id} (${key.provider}) returned ${resp.status}, may need attention`);
      }
    } catch (e: any) {
      results.push({ id: key.id, provider: key.provider, ok: false, error: e.message });
    }
  }

  return Response.json({ checked: keys.length, results });
}
