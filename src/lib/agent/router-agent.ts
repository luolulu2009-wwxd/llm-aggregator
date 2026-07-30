/**
 * Router Agent — AI-driven route evolution.
 *
 * Observes per-intent model performance metrics, discovers that
 * certain models outperform others for specific intents, and
 * automatically updates the DB routing rules.
 *
 * Self-evolves: starts with human-curated defaults, improves
 * over time as real usage data reveals which model is best
 * for each intent.
 */
import { prisma } from "../prisma";
import { getAllSnapshots } from "../metrics";

interface IntentPerformance {
  intent: string;
  modelScores: Map<string, { score: number; calls: number }>;
  currentBest: string;
}

// ── Configuration ──
const MIN_CALLS_TO_SWITCH = 20;    // minimum calls before considering a switch
const SCORE_THRESHOLD = 0.15;       // new model must be 15% better to replace
const AGENT_CYCLE_MS = 300_000;     // 5 minutes between cycles

/** Extract intent from metrics key: "modelSlug|tier|lang|intent" */
function parseIntentFromKey(key: string): string | null {
  const parts = key.split("|");
  return parts.length >= 4 && parts[3] !== "auto" ? parts[3] : null;
}

function parseModelFromKey(key: string): string {
  return key.split("|")[0];
}

/** Agent cycle — evaluates routing rules and proposes updates */
export async function runRouterAgent(): Promise<string[]> {
  const actions: string[] = [];
  const allSnapshots = getAllSnapshots();

  // Group metrics by intent
  const intentPerf = new Map<string, IntentPerformance>();
  for (const [key, snap] of Object.entries(allSnapshots)) {
    const intent = parseIntentFromKey(key);
    if (!intent || snap.calls < MIN_CALLS_TO_SWITCH) continue;

    const model = parseModelFromKey(key);
    let perf = intentPerf.get(intent);
    if (!perf) {
      perf = { intent, modelScores: new Map(), currentBest: "" };
      intentPerf.set(intent, perf);
    }

    // Composite score (same formula as weight engine)
    const price = snap.calls > 0 ? 0.01 : 0.01; // simplified
    const score = (
      0.45 * snap.successRate +
      0.15 * (1 - snap.emptyRate) +
      0.10 * (1 - Math.min(snap.avgLatencyMs / 10000, 1)) +
      0.20 * (1 / (1 + price * 100))
    );
    perf.modelScores.set(model, { score, calls: snap.calls });
  }

  // For each intent, find the best model and compare with current DB rule
  for (const [intent, perf] of intentPerf) {
    let bestModel = "";
    let bestScore = 0;
    let totalCalls = 0;

    for (const [model, { score, calls }] of perf.modelScores) {
      totalCalls += calls;
      if (score > bestScore) { bestScore = score; bestModel = model; }
    }

    if (!bestModel || totalCalls < MIN_CALLS_TO_SWITCH) continue;

    // Check current DB rule
    try {
      const currentRule = await prisma.routeRule.findFirst({
        where: { intent, isActive: true },
        select: { targetModel: true },
      });

      if (currentRule && currentRule.targetModel !== bestModel) {
        // Only switch if new model is significantly better
        const currentScore = perf.modelScores.get(currentRule.targetModel)?.score || 0;
        if (bestScore > currentScore * (1 + SCORE_THRESHOLD)) {
          await prisma.routeRule.update({
            where: { intent_id: { intent, id: (await prisma.routeRule.findFirst({ where: { intent } }))!.id } },
            data: { targetModel: bestModel },
          });
          actions.push(`route:${intent}: ${currentRule.targetModel} → ${bestModel} (Δ${(bestScore - currentScore).toFixed(3)})`);
          console.log(`[router-agent] 🔄 ${intent}: ${currentRule.targetModel} → ${bestModel} (score: ${currentScore.toFixed(3)} → ${bestScore.toFixed(3)})`);
        }
      } else if (!currentRule) {
        // No rule exists for this intent → create one
        await prisma.routeRule.create({
          data: { intent, targetModel: bestModel, keywords: intent, priority: 5, isActive: true },
        });
        actions.push(`route:new:${intent} → ${bestModel}`);
        console.log(`[router-agent] 🆕 New intent ${intent} → ${bestModel}`);
      }
    } catch (err) {
      console.warn(`[router-agent] DB error for ${intent}:`, (err as Error).message);
    }
  }

  return actions;
}

/** Agent cycle interval */
export const ROUTER_AGENT_INTERVAL = AGENT_CYCLE_MS;
