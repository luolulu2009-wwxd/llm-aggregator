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

/** Payout to contributor when their key is banned */
export async function payoutKeyBanned(keyId: string) {
  // Get the key info
  const key = await prisma.providerKey.findUnique({
    where: { id: keyId },
    select: { userId: true, contributedTokens: true, earnedCredits: true, status: true },
  });
  if (!key || key.status !== "banned") return null;

  // Check if already paid out
  const existingPayout = await prisma.transaction.findFirst({
    where: { userId: key.userId, type: "insurance_payout", description: { contains: keyId } },
  });
  if (existingPayout) return null; // already paid

  // Calculate payout: 50% of earned credits (covers partial loss)
  const payoutAmount = Number(key.earnedCredits) * 0.5;
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
