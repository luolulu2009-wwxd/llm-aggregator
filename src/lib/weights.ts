/**
 * Weight Engine — multi-objective scoring + ε-greedy exploration.
 *
 * Ranks model candidates by composite score:
 *   Score = 0.45×success + 0.15×content + 0.10×latency + 0.20×cost + 0.10×explore
 *
 * ε-greedy: 90% exploit (best model), 10% explore (random candidate)
 * Exploration bonus decays as confidence grows → converges to optimal.
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

const EPSILON = 0.10; // 10% exploration rate

/**
 * Score a single model candidate.
 * Higher = better choice.
 */
function scoreCandidate(
  slug: string,
  tier: number,
  language: string,
): number {
  const snap = getSnapshot(slug, tier, language);
  const price = PRICE[slug] || 0.01;

  // No data → neutral score, boosted for exploration
  if (!snap || snap.calls < 3) return 0.5 + (1 / Math.sqrt(1));

  const s = snap;
  const costNorm = 1 / (1 + price * 100);

  return (
    0.45 * s.successRate +
    0.15 * (1 - s.emptyRate) +
    0.10 * (1 - Math.min(s.avgLatencyMs / 10000, 1)) +
    0.20 * costNorm +
    0.10 * (1 / Math.sqrt(s.calls + 1)) // exploration bonus
  );
}

/**
 * Rank candidates by score, with ε-greedy exploration.
 * Returns reordered list: best first.
 */
export function rankCandidates(
  candidates: string[],
  tier: number,
  language: string,
): string[] {
  if (candidates.length <= 1) return candidates;

  // ε-greedy: randomly shuffle one candidate to front
  const explore = Math.random() < EPSILON && candidates.length > 1;
  const shuffled = explore
    ? [candidates[Math.floor(Math.random() * (candidates.length - 1) + 1)], ...candidates.filter((_, i) => i !== 1)]
    : [...candidates];

  // Score + sort (stable sort preserves ε-greedy shuffle for ties)
  const scored = shuffled.map(slug => ({ slug, score: scoreCandidate(slug, tier, language) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.slug);
}

/** Get score for a specific model (debug/dashboard) */
export function getScore(slug: string, tier: number, language: string): number {
  return scoreCandidate(slug, tier, language);
}
