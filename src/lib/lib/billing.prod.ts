/**
 * Credits Engine — Production Edition
 *
 * Full contribution reward system with ×1.2 multiplier,
 * atomic transaction accounting, and insurance pool integration.
 */

import { prisma } from "./prisma";
import { detectSelfDealing } from "./abuse";

interface UsageInput {
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
  consumerIp?: string;
}

export async function recordUsage(input: UsageInput) {
  // 1. Calculate cost from model pricing
  const model = await prisma.model.findUnique({ where: { slug: input.modelSlug } });
  const cost = model
    ? Number(model.inputPrice) * input.promptTokens + Number(model.outputPrice) * input.completionTokens
    : (input.promptTokens + input.completionTokens) * 0.000001;

  // 2. Atomic: deduct from consumer + reward contributor
  await prisma.$transaction(async (tx: any) => {
    // Record usage log
    await tx.usageLog.create({
      data: {
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        providerKeyId: input.providerKeyId,
        modelSlug: input.modelSlug,
        provider: input.provider,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        cost,
        routeReason: input.routeReason,
        isStreaming: input.isStreaming,
        durationMs: input.durationMs,
        status: "success",
      },
    });

    // Deduct from consumer balance
    const consumer = await tx.user.update({
      where: { id: input.userId },
      data: { creditBalance: { decrement: cost } },
    });

    await tx.transaction.create({
      data: {
        userId: input.userId,
        amount: -cost,
        type: "deduct",
        description: `使用 ${input.modelSlug} (${input.promptTokens}+${input.completionTokens} tokens)`,
        balanceAfter: consumer.creditBalance,
      },
    });

    // Get provider key owner
    const providerKey = await tx.providerKey.findUnique({
      where: { id: input.providerKeyId },
      select: { userId: true },
    });

    // Anti-abuse: check self-dealing (same IP using own keys)
    let selfDealing = false;
    if (input.consumerIp && providerKey) {
      selfDealing = await detectSelfDealing(input.consumerIp, providerKey.userId, input.userId);
    }

    // Reward key contributor (×1.2) — only if different from consumer AND not self-dealing
    if (providerKey && providerKey.userId !== input.userId && !selfDealing) {
      const reward = cost * 1.2; // ×1.2 of the ACTUAL cost at this model's pricing
      const totalTokens = input.promptTokens + input.completionTokens;

      const contributor = await tx.user.update({
        where: { id: providerKey.userId },
        data: { creditBalance: { increment: reward } },
      });

      await tx.transaction.create({
        data: {
          userId: providerKey.userId,
          amount: reward,
          type: "contribution",
          description: `Key贡献 ×1.2 (${input.modelSlug}: ${totalTokens}tokens → ¥${reward.toFixed(6)})`,
          balanceAfter: contributor.creditBalance,
        },
      });

      // Update key contribution stats
      await tx.providerKey.update({
        where: { id: input.providerKeyId },
        data: {
          contributedTokens: { increment: totalTokens },
          earnedCredits: { increment: reward },
          todayUsed: { increment: totalTokens },
        },
      });
    } else {
      // Using own key — just update usage count
      await tx.providerKey.update({
        where: { id: input.providerKeyId },
        data: {
          todayUsed: { increment: input.promptTokens + input.completionTokens },
        },
      });
    }
  });

  return { cost };
}
