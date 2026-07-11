import { prisma } from "./prisma";

/**
 * Trust level progression logic.
 * L0 → L1 on phone verification
 * L1 → L2 on first valid contributed key
 * L2 → L3 on manual admin review
 */

export const TRUST_LIMITS = {
  L0: { dailyTokens: 100_000, models: "cheap_only" },
  L1: { dailyTokens: 500_000, models: "all" },
  L2: { dailyTokens: 2_000_000, models: "all", priorityQueue: true },
  L3: { dailyTokens: 20_000_000, models: "all", priorityQueue: true, custom: true },
} as const;

export async function evaluateTrustLevel(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustLevel: true },
  });
  if (!user) return "L0";

  // Don't auto-upgrade L3 (manual only)
  if (user.trustLevel === "L3") return "L3";

  // Check if user can be upgraded to L2 (has contributed a valid key)
  if (user.trustLevel === "L1") {
    const keyCount = await prisma.providerKey.count({
      where: { userId, status: "active" },
    });
    if (keyCount > 0) {
      await prisma.user.update({ where: { id: userId }, data: { trustLevel: "L2" } });
      return "L2";
    }
  }

  return user.trustLevel;
}

export async function upgradeToL1(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustLevel: true } });
  if (!user || user.trustLevel !== "L0") return;
  await prisma.user.update({ where: { id: userId }, data: { trustLevel: "L1" } });

  // Log the upgrade
  await prisma.abuseEvent.create({
    data: {
      userId,
      triggerType: "trust_upgrade",
      severity: "info",
      action: "upgrade:L0→L1",
    },
  });
}

export async function downgradeTrust(userId: string, reason: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustLevel: true } });
  if (!user) return;

  const currentLevel = user.trustLevel;
  const downgradeMap: Record<string, string> = { L3: "L2", L2: "L1", L1: "L0" };
  const newLevel = downgradeMap[currentLevel] || "L0";

  await prisma.user.update({ where: { id: userId }, data: { trustLevel: newLevel } });
  await prisma.abuseEvent.create({
    data: {
      userId,
      triggerType: "trust_downgrade",
      severity: "warning",
      action: `downgrade:${currentLevel}→${newLevel}`,
      matchedRule: reason,
    },
  });
}
