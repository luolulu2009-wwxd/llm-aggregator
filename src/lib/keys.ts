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
): Promise<{ id: string; keyEncrypted: string } | null> {
  // Simple: pick the key with lowest usage
  const key = await prisma.providerKey.findFirst({
    where: { provider, modelFamily, status: "active" },
    orderBy: { todayUsed: "asc" },
  });
  return key ? { id: key.id, keyEncrypted: key.keyEncrypted } : null;
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
