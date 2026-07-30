/**
 * Agent Scheduler — background execution of endogenous AI agents.
 *
 * Runs on Next.js server startup, executes agent cycles on a schedule.
 * Each agent runs independently — failures in one don't block others.
 */
import { runToolAgent } from "./tool-agent";
import { runRouterAgent } from "./router-agent";

let started = false;

/** Start all background agent cycles */
export function startAgents(): void {
  if (started) return;
  started = true;

  console.log("[agent-scheduler] 🤖 Starting endogenous AI agents...");

  // Tool agent: every 5 minutes
  setInterval(async () => {
    try {
      const actions = await runToolAgent();
      if (actions.length > 0) {
        console.log("[agent-scheduler] Tool agent actions:", actions.join(", "));
      }
    } catch (err) {
      console.warn("[agent-scheduler] Tool agent error:", (err as Error).message);
    }
  }, 300_000).unref();

  // Router agent: every 5 minutes (offset by 2min to avoid overlap)
  setTimeout(() => {
    setInterval(async () => {
      try {
        const actions = await runRouterAgent();
        if (actions.length > 0) {
          console.log("[agent-scheduler] Router agent actions:", actions.join(", "));
        }
      } catch (err) {
        console.warn("[agent-scheduler] Router agent error:", (err as Error).message);
      }
    }, 300_000).unref();
  }, 120_000);

  console.log("[agent-scheduler] ✅ Agents started (tool:5min, router:5min)");
}

/** Trigger a single agent cycle manually (for testing/debug) */
export async function runAllAgentsOnce(): Promise<{ tool: string[]; router: string[] }> {
  const tool = await runToolAgent();
  const router = await runRouterAgent();
  return { tool, router };
}
