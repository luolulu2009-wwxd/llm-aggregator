/**
 * Credits Engine — Open Source Stub
 *
 * This module handles token counting, credit deduction, and contribution
 * rewards. The production implementation is proprietary.
 *
 * To implement your own Credits Engine:
 *   1. Count tokens from provider responses
 *   2. Deduct credits at model-specific pricing
 *   3. Reward key contributors (suggested: ×1.2 multiplier)
 *   4. Keep all operations in database transactions for consistency
 */

import { prisma } from "./prisma";

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
  // TODO: Implement proper credit calculation and deduction
  // 1. Look up model pricing from Model table
  // 2. Deduct from user's credit balance
  // 3. Reward key contributor (×1.2 suggested)
  // 4. Update ProviderKey.contributedTokens and .todayUsed

  await prisma.usageLog.create({
    data: {
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      providerKeyId: input.providerKeyId,
      modelSlug: input.modelSlug,
      provider: input.provider,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      cost: 0, // TODO: calculate from model pricing
      routeReason: input.routeReason,
      isStreaming: input.isStreaming,
      durationMs: input.durationMs,
      status: "success",
    },
  });

  return { cost: 0 };
}
