/**
 * Insurance Pool — protects key contributors against provider bans.
 * Funded by 1% of platform topup fees.
 */

import { prisma } from "./prisma";

/** Get current insurance pool balance */
export async function getPoolBalance(): Promise<number> {
  const pool = await prisma.insurancePool.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!pool) {
    const created = await prisma.insurancePool.create({ data: { balance: 0 } });
    return Number(created.balance);
  }
  return Number(pool.balance);
}

/** Fund the pool (called from topup) */
export async function fundPool(amount: number) {
  const pool = await prisma.insurancePool.findFirst({ orderBy: { updatedAt: "desc" } });
  if (pool) {
    return prisma.insurancePool.update({
      where: { id: pool.id },
      data: { balance: { increment: amount } },
    });
  }
  return prisma.insurancePool.create({ data: { balance: amount } });
}

// Configuration
const COOLDOWN_DAYS = 7;         // Key must be active for 7 days before insured
const MAX_PAYOUT = 10;           // Max ¥10 payout per key
const PAYOUT_RATIO = 0.5;        // 50% of earned credits
const KEY_UPLOAD_STAKE = 1.0;    // ¥1 stake per key, goes to insurance pool

/** Deduct stake when uploading a key */
export async function collectKeyStake(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  if (!user || Number(user.creditBalance) < KEY_UPLOAD_STAKE) {
    throw new Error(`上传 Key 需要 ¥${KEY_UPLOAD_STAKE} 押金（进入保险池）`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: KEY_UPLOAD_STAKE } } });
    await tx.transaction.create({
      data: { userId, amount: -KEY_UPLOAD_STAKE, type: "deduct", description: "Key 上传押金（进入保险池）", balanceAfter: 0 },
    });
    await fundPool(KEY_UPLOAD_STAKE);
  });
}

/** Payout to contributor when their key is banned */
export async function payoutKeyBanned(keyId: string) {
  const key = await prisma.providerKey.findUnique({
    where: { id: keyId },
    select: { userId: true, contributedTokens: true, earnedCredits: true, status: true, createdAt: true },
  });
  if (!key || key.status !== "banned") return null;

  // Cooldown check: key must be at least COOLDOWN_DAYS old
  const keyAge = (Date.now() - key.createdAt.getTime()) / (86400000);
  if (keyAge < COOLDOWN_DAYS) return null;

  // Check if already paid out
  const existingPayout = await prisma.transaction.findFirst({
    where: { userId: key.userId, type: "insurance_payout", description: { contains: keyId } },
  });
  if (existingPayout) return null;

  // Calculate payout: 50% of earned credits, capped at MAX_PAYOUT
  const rawPayout = Number(key.earnedCredits) * PAYOUT_RATIO;
  const payoutAmount = Math.min(rawPayout, MAX_PAYOUT);
  if (payoutAmount <= 0) return null;

  // Get pool balance
  const poolBalance = await getPoolBalance();
  if (poolBalance < payoutAmount) {
    // Partial payout with available funds
    const partialPayout = poolBalance;
    if (partialPayout <= 0) return null;

    await prisma.$transaction(async (tx) => {
      await tx.insurancePool.update({
        where: { id: (await tx.insurancePool.findFirst({ orderBy: { updatedAt: "desc" } }))!.id },
        data: { balance: { decrement: partialPayout } },
      });
      await tx.user.update({
        where: { id: key.userId },
        data: { creditBalance: { increment: partialPayout } },
      });
      await tx.transaction.create({
        data: {
          userId: key.userId,
          amount: partialPayout,
          type: "insurance_payout",
          description: `保险池赔付 (Key ${keyId} 被封，池余额不足，部分赔付)`,
          balanceAfter: 0, // will be recalculated
        },
      });
    });
    return { payout: partialPayout, partial: true };
  }

  // Full payout
  await prisma.$transaction(async (tx) => {
    await tx.insurancePool.update({
      where: { id: (await tx.insurancePool.findFirst({ orderBy: { updatedAt: "desc" } }))!.id },
      data: { balance: { decrement: payoutAmount } },
    });
    await tx.user.update({
      where: { id: key.userId },
      data: { creditBalance: { increment: payoutAmount } },
    });
    await tx.transaction.create({
      data: {
        userId: key.userId,
        amount: payoutAmount,
        type: "insurance_payout",
        description: `保险池赔付 (Key ${keyId} 被提供商封禁，赔付已赚积分的50%)`,
        balanceAfter: 0,
      },
    });
  });

  return { payout: payoutAmount, partial: false };
}
