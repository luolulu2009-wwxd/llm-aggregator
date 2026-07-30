/**
 * Key Pool Manager — Open Source Edition
 *
 * Provides basic key storage, selection, and management.
 * The production instance uses an enhanced version with:
 *   - Inverse-square weighted key selection
 *   - Automatic daily limit reset
 *   - Advanced contribution tracking
 *
 * For the enhanced version, deploy via our official instance
 * or implement your own selection algorithm.
 */

import { prisma } from "./prisma";
import { encrypt, hashKeySuffix } from "./crypto";

// ----------------------------------------------------------------
// If you have the proprietary module, import it instead:
// import { uploadProviderKey, selectBestKey } from "./keys.proprietary";
// ----------------------------------------------------------------

export async function uploadProviderKey(input: {
  userId: string;
  provider: string;
  modelFamily: string;
  keyValue: string;
  dailyLimit: number;
}) {
  const keyHash = hashKeySuffix(input.keyValue);
  const keyEncrypted = encrypt(input.keyValue);

  // Check duplicate
  const existing = await prisma.providerKey.findFirst({
    where: { userId: input.userId, keyHash },
  });
  if (existing) throw new Error("Duplicate key");

  return prisma.providerKey.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      modelFamily: input.modelFamily,
      keyEncrypted,
      keyHash,
      dailyLimit: input.dailyLimit,
      status: "pending",
    },
  });
}

export async function selectBestKey(
  provider: string,
  modelFamily: string,
): Promise<{ id: string; keyEncrypted: string; modelFamily: string } | null> {
  try {
    // Simple: pick the key with lowest usage
    const key = await prisma.providerKey.findFirst({
      where: { provider, modelFamily, status: "active" },
      orderBy: { todayUsed: "asc" },
    });

    if (key) return { id: key.id, keyEncrypted: key.keyEncrypted, modelFamily: key.modelFamily };

    // Fallback: try provider-default
    const fallbackKey = await prisma.providerKey.findFirst({
      where: { provider, modelFamily: provider + "-default", status: "active" },
      orderBy: { todayUsed: "asc" },
    });
    if (fallbackKey) return { id: fallbackKey.id, keyEncrypted: fallbackKey.keyEncrypted, modelFamily: fallbackKey.modelFamily };

    // Provider-generic fallback: one API key usually works for ALL models from that provider
    const anyProviderKey = await prisma.providerKey.findFirst({
      where: { provider, status: "active" },
      orderBy: { todayUsed: "asc" },
    });
    if (anyProviderKey) {
      console.log(`[selectBestKey] Using generic ${provider} key ${anyProviderKey.id} (modelFamily: ${anyProviderKey.modelFamily}) for requested ${modelFamily}`);
      return { id: anyProviderKey.id, keyEncrypted: anyProviderKey.keyEncrypted, modelFamily: anyProviderKey.modelFamily };
    }

    console.warn(`[selectBestKey] No active key found for ${provider}/${modelFamily}`);
    return null;
  } catch (err) {
    console.error(`[selectBestKey] Error querying ${provider}/${modelFamily}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function listProviderKeys(userId: string) {
  return prisma.providerKey.findMany({
    where: { userId },
    select: {
      id: true, provider: true, modelFamily: true,
      dailyLimit: true, todayUsed: true, status: true,
      contributedTokens: true, earnedCredits: true,
      lastHealthCheck: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function pauseProviderKey(userId: string, keyId: string) {
  const key = await prisma.providerKey.findFirst({ where: { id: keyId, userId } });
  if (!key) throw new Error("Key not found");
  return prisma.providerKey.update({ where: { id: keyId }, data: { status: "paused" } });
}

export async function resumeProviderKey(userId: string, keyId: string) {
  const key = await prisma.providerKey.findFirst({ where: { id: keyId, userId } });
  if (!key) throw new Error("Key not found");
  if (key.status === "banned") throw new Error("Cannot resume banned key");
  return prisma.providerKey.update({ where: { id: keyId }, data: { status: "active" } });
}

export async function deleteProviderKey(userId: string, keyId: string) {
  const key = await prisma.providerKey.findFirst({ where: { id: keyId, userId } });
  if (!key) throw new Error("Key not found");
  return prisma.providerKey.delete({ where: { id: keyId } });
}

/**
 * Select a key for embedding calls. Tries OpenAI first, then GLM, then Qwen.
 * Returns both the encrypted key and provider info for endpoint selection.
 */
export async function selectBestKeyForEmbedding(): Promise<{
  id: string; keyEncrypted: string; provider: string;
} | null> {
  const embeddingProviders = ["openai", "glm", "qwen"];

  for (const prov of embeddingProviders) {
    const key = await prisma.providerKey.findFirst({
      where: { provider: prov, status: "active" },
      orderBy: { todayUsed: "asc" },
    });
    if (key) return { id: key.id, keyEncrypted: key.keyEncrypted, provider: prov };
  }
  return null;
}
