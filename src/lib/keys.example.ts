/**
 * Key Pool Manager — Open Source Stub
 *
 * This module manages the API key pool: encrypted storage, key selection,
 * and contribution tracking. The production implementation is proprietary.
 *
 * To implement your own Key Pool:
 *   1. Store provider API keys with AES-256-GCM encryption
 *   2. Select the best key using inverse-square weighted algorithm
 *   3. Track daily token usage per key
 *   4. Integrate with `src/lib/crypto.ts` for encryption
 *
 * See the production API at our official instance for reference behavior.
 */

import { prisma } from "./prisma";
import { decrypt, hashKeySuffix } from "./crypto";

// === Stub implementation — replace with your own logic ===

export async function uploadProviderKey(input: {
  userId: string;
  provider: string;
  modelFamily: string;
  keyValue: string;
  dailyLimit: number;
}) {
  // TODO: Encrypt keyValue before storing
  const keyHash = hashKeySuffix(input.keyValue);

  return prisma.providerKey.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      modelFamily: input.modelFamily,
      keyEncrypted: "TODO: encrypt keyValue with crypto.encrypt()",
      keyHash,
      dailyLimit: input.dailyLimit,
      status: "active",
    },
  });
}

export async function selectBestKey(
  provider: string,
  modelFamily: string,
): Promise<{ id: string; keyEncrypted: string } | null> {
  // TODO: Implement inverse-square weighted selection algorithm
  // 1. Reset daily counters past midnight
  // 2. Filter active keys under daily limit
  // 3. Weight by 1/(usage+1)²  — keys with lower usage get priority
  // 4. Random selection proportional to weight
  const key = await prisma.providerKey.findFirst({
    where: { provider, modelFamily, status: "active" },
    orderBy: { todayUsed: "asc" },
  });

  return key ? { id: key.id, keyEncrypted: key.keyEncrypted } : null;
}

export async function listProviderKeys(userId: string) {
  return prisma.providerKey.findMany({ where: { userId } });
}

export async function pauseProviderKey(userId: string, keyId: string) {
  return prisma.providerKey.update({
    where: { id: keyId },
    data: { status: "paused" },
  });
}

export async function deleteProviderKey(userId: string, keyId: string) {
  return prisma.providerKey.delete({ where: { id: keyId } });
}
