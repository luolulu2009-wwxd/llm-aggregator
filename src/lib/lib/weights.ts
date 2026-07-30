/**
 * Weight Engine — multi-objective scoring + ε-greedy exploration.
 *
 * Cold start: uses curated tier position (TIER_CANDIDATES order) as default score.
 * As data accumulates, gradually shifts from curated → data-driven.
 *
 * Score (warm) = 0.45×success + 0.15×(1-empty) + 0.10×latency + 0.20×cost
 */
import { getSnapshot, MetricSnapshot } from "./metrics";

// ── Pricing reference (CNY per token) ──
const PRICE: Record<string, number> = {
  "moonshot/kimi-k3": 0.00013,
  "moonshot/moonshot-v1-8k": 0.0024,
  "deepseek/deepseek-v4-pro": 0.0375,
  "deepseek/deepseek-v4-flash": 0.0075,
  "glm/glm-4.7-flash": 0.0002,
  "glm/glm-4.7": 0.015,
  "glm/glm-5.1": 0.03,
  "glm/glm-5.2": 0.045,
  "anthropic/claude-haiku-4-5-20251001": 0.0346,
  "anthropic/claude-sonnet-5": 0.1296,
  "anthropic/claude-opus-4-8": 0.648,
  "doubao/doubao-seed-2-1-pro": 0.006,
  "doubao/doubao-seed-evolving": 0.005,
  "qwen/qwen-max-latest": 0.008,
  "openai/gpt-5": 0.18,
  "openrouter/claude-sonnet-5": 0.1296,
  "openrouter/claude-opus-4-8": 0.648,
  "openrouter/claude-haiku-4-5": 0.0346,
  "openrouter/claude-fable-5": 0.0432,
  "openrouter/gpt-5": 0.18,
};

// ── Curated tier order (mirrors classifier.ts TIER_CANDIDATES) ──
// Higher position index → lower default score
const CURATED_ORDER: Record<string, number> = {
  // Tier 0: trivial
  "deepseek/deepseek-v4-flash": 0, "moonshot/moonshot-v1-8k": 1,
  "glm/glm-4.7-flash": 2, "doubao/doubao-seed-evolving": 3,
  // Tier 1: simple
  "deepseek/deepseek-v4-pro": 0, "doubao/doubao-seed-2-1-pro": 2,
  "qwen/qwen-max-latest": 3, "openrouter/claude-sonnet-5": 5,
  // Tier 2: moderate
  "glm/glm-5.1": 4, "openai/gpt-5": 5,
  // Tier 3: complex
  "openrouter/gpt-5": 4, "glm/glm-5.2": 5, "anthropic/claude-opus-4-8": 6,
  // Tier 4: deep
  "openrouter/claude-opus-4-8": 0,
};

function getCuratedScore(slug: string): number {
  // Lower position = higher score; default mid-range for unlisted models
  const pos = CURATED_ORDER[slug];
  if (pos !== undefined) return Math.max(0.2, 0.95 - pos * 0.12);
  return 0.5; // neutral for unlisted
}

const EPSILON = 0.02; // 2% exploration — low because curated order handles cold start

/**
 * Score a model candidate. Cold start → curated order. Warm → blend with real data.
 */
function scoreCandidate(
  slug: string,
  tier: number,
  language: string,
): number {
  const snap = getSnapshot(slug, tier, language);
  const price = PRICE[slug] || 0.01;
  const curated = getCuratedScore(slug);

  // No data → 100% curated
  if (!snap || snap.calls < 5) return curated;

  // Gradual data takeover: calls 5→30, data weight 0→1
  const dataWeight = Math.min(1, (snap.calls - 5) / 25);
  const dataScore = (
    0.45 * snap.successRate +
    0.15 * (1 - snap.emptyRate) +
    0.10 * (1 - Math.min(snap.avgLatencyMs / 10000, 1)) +
    0.20 * (1 / (1 + price * 100))
  );

  return curated * (1 - dataWeight) + dataScore * dataWeight;
}

/**
 * Rank candidates by composite score.
 *
 * Cold start: uses curated order (TIER_CANDIDATES position).
 * Warm: blends curated + real performance data.
 * ε-greedy: 2% chance to swap #1 with a lower-ranked candidate for exploration.
 */
export function rankCandidates(
  candidates: string[],
  tier: number,
  language: string,
): string[] {
  if (candidates.length <= 1) return candidates;

  // Score + sort
  const scored = candidates.map(slug => ({ slug, score: scoreCandidate(slug, tier, language) }));
  scored.sort((a, b) => b.score - a.score);

  // ε-greedy: 2% chance to promote a random candidate to #1 for exploration
  if (Math.random() < EPSILON && scored.length > 1) {
    const swapIdx = 1 + Math.floor(Math.random() * (scored.length - 1));
    [scored[0], scored[swapIdx]] = [scored[swapIdx], scored[0]];
  }

  return scored.map(s => s.slug);
}

/** Get score for a specific model (debug/dashboard) */
export function getScore(slug: string, tier: number, language: string): number {
  return scoreCandidate(slug, tier, language);
}
