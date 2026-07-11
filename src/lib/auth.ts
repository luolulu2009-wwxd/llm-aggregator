import { prisma } from "./prisma";
import { createHash } from "crypto";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface AuthResult {
  userId: string;
  apiKeyId: string;
}

export async function validateApiKey(header: string | null): Promise<AuthResult | null> {
  if (!header || !header.startsWith("Bearer ")) return null;

  const key = header.slice(7).trim();
  if (!key) return null;

  const keyHash = hashKey(key);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, isActive: true },
  });

  if (!apiKey || !apiKey.isActive) return null;

  // Update last used time (async, don't block)
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: apiKey.userId, apiKeyId: apiKey.id };
}

/** Hash a raw key for storage */
export { hashKey };
