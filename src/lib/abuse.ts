/**
 * Anti-abuse system — multi-layer protection against malicious users.
 */

import { getRedisSync } from "./redis";
import { prisma } from "./prisma";

// === 1. Registration rate limiting ===
export async function checkRegistrationAbuse(ip: string): Promise<{ allowed: boolean; reason?: string }> {
  const redis = getRedisSync();
  if (!redis) return { allowed: true };

  const key = `reg:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400); // 24h TTL

  if (count > 1) {
    return { allowed: false, reason: "该 IP 24小时内已注册过，请明天再试" };
  }
  return { allowed: true };
}

// === 2. Self-dealing detection ===
export async function detectSelfDealing(
  consumerIp: string,
  keyOwnerId: string,
  consumerId: string,
): Promise<boolean> {
  // Same user → not self-dealing (using own key)
  if (keyOwnerId === consumerId) return false;

  const redis = getRedisSync();
  if (!redis) return false;

  // Check if this consumer IP has uploaded keys by this owner
  const ownerIps = await redis.smembers(`owner_ips:${keyOwnerId}`);
  if (ownerIps.includes(consumerIp)) return true;

  // Track consumer IPs for each key owner
  await redis.sadd(`owner_ips:${keyOwnerId}`, consumerIp);
  await redis.expire(`owner_ips:${keyOwnerId}`, 86400);

  return false;
}

// === 3. Abnormal earnings detection ===
export async function checkEarningsAbuse(keyId: string, newReward: number): Promise<boolean> {
  const redis = getRedisSync();
  if (!redis) return false;

  const dailyKey = `earnings:${keyId}:${new Date().toISOString().slice(0, 10)}`;
  const todayEarnings = await redis.incrbyfloat(dailyKey, newReward);
  await redis.expire(dailyKey, 86400);

  // Flag if daily earnings exceed ¥5 for an L0-L1 user's key
  if (todayEarnings > 5) {
    const key = await prisma.providerKey.findUnique({
      where: { id: keyId },
      select: { userId: true },
    });
    if (key) {
      const user = await prisma.user.findUnique({
        where: { id: key.userId },
        select: { trustLevel: true },
      });
      if (user && (user.trustLevel === "L0" || user.trustLevel === "L1")) {
        return true; // flag for review
      }
    }
  }
  return false;
}

// === 4. Admin: freeze user ===
export async function freezeUser(userId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { trustLevel: "L0" } });
    await tx.providerKey.updateMany({ where: { userId }, data: { status: "paused" } });
    await tx.abuseEvent.create({
      data: { userId, triggerType: "admin_freeze", severity: "frozen", action: "freeze", matchedRule: reason },
    });
  });
}

// === 5. Admin: ban user ===
export async function banUser(userId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { trustLevel: "L0", creditBalance: 0 } });
    await tx.providerKey.updateMany({ where: { userId }, data: { status: "banned" } });
    await tx.apiKey.updateMany({ where: { userId }, data: { isActive: false } });
    await tx.abuseEvent.create({
      data: { userId, triggerType: "admin_ban", severity: "frozen", action: "ban", matchedRule: reason },
    });
  });
}

// === 6. List flagged users ===
export async function listFlaggedUsers() {
  const events = await prisma.abuseEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, userId: true, triggerType: true, severity: true, action: true, matchedRule: true, createdAt: true },
  });
  return events;
}
