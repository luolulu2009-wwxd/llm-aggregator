/**
 * Credits Engine — Open Source Edition
 *
 * Provides basic usage logging and cost tracking.
 * The production instance uses an enhanced version with:
 *   - Automatic credit deduction at model-specific pricing
 *   - Key contributor rewards (×1.2 multiplier)
 *   - Insurance pool integration
 *   - Atomic transaction-based accounting
 *
 * For the enhanced version, deploy via our official instance
 * or implement your own billing logic.
 */

import { prisma } from "./prisma";

// ----------------------------------------------------------------
// If you have the proprietary module, import it instead:
// import { recordUsage } from "./billing.proprietary";
// ----------------------------------------------------------------

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
  // Look up model pricing
  const model = await prisma.model.findUnique({ where: { slug: input.modelSlug } });
  const cost = model
    ? Number(model.inputPrice) * input.promptTokens + Number(model.outputPrice) * input.completionTokens
    : 0;

  // Record usage
  await prisma.usageLog.create({
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

  // Update key usage counter
  await prisma.providerKey.update({
    where: { id: input.providerKeyId },
    data: { todayUsed: { increment: input.promptTokens + input.completionTokens } },
  });

  return { cost };
}
