import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { getAdapterByProvider } from "./adapters/factory";

const PING_MESSAGE = { role: "user", content: "hi" };

export async function checkKeyHealth(keyId: string) {
  const key = await prisma.providerKey.findUnique({ where: { id: keyId } });
  if (!key) return;

  const adapter = getAdapterByProvider(key.provider);
  if (!adapter) return;

  let apiKey: string;
  try {
    apiKey = decrypt(key.keyEncrypted);
  } catch {
    await prisma.providerKey.update({
      where: { id: keyId },
      data: { status: "banned", lastHealthCheck: new Date() },
    });
    return;
  }

  const { url, headers, body } = adapter.buildRequest(
    {
      model: key.modelFamily,
      messages: [PING_MESSAGE],
      max_tokens: 1,
      stream: false,
    },
    apiKey,
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401 || response.status === 403) {
      await prisma.providerKey.update({
        where: { id: keyId },
        data: { status: "banned", lastHealthCheck: new Date() },
      });
    } else if (response.status === 429) {
      // Rate limited — keep active but mark check time
      await prisma.providerKey.update({
        where: { id: keyId },
        data: { lastHealthCheck: new Date() },
      });
    } else {
      // OK — mark healthy
      await prisma.providerKey.update({
        where: { id: keyId },
        data: {
          status: key.status === "pending" ? "active" : key.status,
          lastHealthCheck: new Date(),
        },
      });
    }
  } catch {
    // Timeout or network error — don't change status, just update check time
    await prisma.providerKey.update({
      where: { id: keyId },
      data: { lastHealthCheck: new Date() },
    });
  }
}

export async function runAllHealthChecks() {
  const keys = await prisma.providerKey.findMany({
    where: {
      status: { in: ["pending", "active"] },
    },
    select: { id: true },
  });

  const results = await Promise.allSettled(keys.map((k) => checkKeyHealth(k.id)));

  return {
    total: keys.length,
    checked: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}
