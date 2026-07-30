/**
 * Credits Engine
 *
 * - Pre-check: before API call, verify user has minimum credits
 * - Post-call: deduct actual cost × markup + record usage + transaction atomically
 * - Pricing: provider real-time cost × 1.3 markup → user price
 */
import { prisma } from "./prisma";

const MIN_BALANCE = 0.005; // CNY — minimum credits to make API calls
export const PRICE_MULTIPLIER = 1.3; // 用户价格 = provider成本 × 1.3
const AGGREGATOR_MARGIN = 0.15;      // 聚合站利润 = provider成本 × 15%
// 贡献者奖励两档 (based on key's contributedTokens + user trustLevel)
const REWARD_BASE = 1.1;   // 标准贡献 (token < 500K 或 L0-L1)
const REWARD_PREMIUM = 1.2; // 优质贡献 (token >= 500K 或 L2+)

/**
 * Fast pre-check before upstream API call.
 * Rejects clearly insufficient balances to avoid wasted provider costs.
 */
export async function checkBalance(
  userId: string,
): Promise<{ sufficient: boolean; balance: number; minimum: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true },
  });
  const balance = Number(user?.creditBalance || 0);
  return { sufficient: balance >= MIN_BALANCE, balance, minimum: MIN_BALANCE };
}

/**
 * Record usage + deduct credits + record transaction atomically.
 *
 * Provider cost: tokens × model_price (what WE pay the provider)
 * User cost:     provider_cost × 1.3 (what USER pays us)
 */
export async function recordUsage(input: {
  userId: string;
  apiKeyId: string;
  providerKeyId: string;
  modelSlug: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  routeReason: string;
  isStreaming: boolean;
  durationMs: number;
}) {
  try {
    // Look up model pricing (what WE pay the provider)
    const model = await prisma.model.findUnique({ where: { slug: input.modelSlug } });
    const inputPrice = model ? Number(model.inputPrice) : 0;
    const outputPrice = model ? Number(model.outputPrice) : 0;

    // Provider cost (our cost)
    const providerCostRaw = inputPrice * input.promptTokens + outputPrice * input.completionTokens;
    const providerCost = Math.round(providerCostRaw * 1e8) / 1e8;

    // User cost (provider cost × 1.3)
    const userCost = Math.round(providerCost * PRICE_MULTIPLIER * 1e8) / 1e8;

    await prisma.$transaction(async (tx) => {
      // 1. Deduct user credits at 1.3x markup
      const user = await tx.user.update({
        where: { id: input.userId },
        data: { creditBalance: { decrement: userCost } },
        select: { creditBalance: true },
      });

      // 2. Record usage log (user-facing cost)
      await tx.usageLog.create({
        data: {
          userId: input.userId,
          apiKeyId: input.apiKeyId,
          providerKeyId: input.providerKeyId,
          modelSlug: input.modelSlug,
          provider: input.provider,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          cost: userCost,
          routeReason: input.routeReason,
          isStreaming: input.isStreaming,
          durationMs: input.durationMs,
          status: "success",
        },
      });

      // 3. Record transaction with both provider and user cost
      await tx.transaction.create({
        data: {
          userId: input.userId,
          amount: -userCost,
          type: "deduct",
          description: `${input.modelSlug}: ${input.promptTokens}+${input.completionTokens} tokens | provider: ¥${providerCost} × ${PRICE_MULTIPLIER} = ¥${userCost}`,
          balanceAfter: user.creditBalance,
        },
      });

      // 4. Update provider key usage counter + contribution rewards
      const key = await tx.providerKey.update({
        where: { id: input.providerKeyId },
        data: { todayUsed: { increment: input.promptTokens + input.completionTokens } },
        select: { userId: true, contributedTokens: true, earnedCredits: true },
      });

      // 5. Contributor rewards: tiered rates based on contribution amount + trust
      const totalContributed = Number(key.contributedTokens || 0);
      const contributorUser = await tx.user.findUnique({
        where: { id: key.userId },
        select: { trustLevel: true },
      });
      const isPremium = totalContributed >= 500_000 || (contributorUser?.trustLevel || "L0") >= "L2";
      const rewardMultiplier = isPremium ? REWARD_PREMIUM : REWARD_BASE;
      const reward = Math.round(providerCost * rewardMultiplier * 1e8) / 1e8;
      if (reward > 0 && key.userId !== input.userId) { // don't reward self-use
        await tx.providerKey.update({
          where: { id: input.providerKeyId },
          data: {
            contributedTokens: { increment: input.promptTokens + input.completionTokens },
            earnedCredits: { increment: reward },
          },
        });
        const contributor = await tx.user.update({
          where: { id: key.userId },
          data: { creditBalance: { increment: reward } },
          select: { creditBalance: true },
        });
        await tx.transaction.create({
          data: {
            userId: key.userId,
            amount: reward,
            type: "contribution",
            description: `${input.modelSlug}: ${input.promptTokens}+${input.completionTokens} tokens → earned ¥${reward}`,
            balanceAfter: contributor.creditBalance,
          },
        });
      }
    });

    return { providerCost, userCost };
  } catch (err) {
    console.error("[billing] recordUsage failed:", err instanceof Error ? err.message : err);
    return { providerCost: 0, userCost: 0 };
  }
}
