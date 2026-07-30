/**
 * Tool Agent — AI-driven tool lifecycle management.
 *
 * Observes tool usage patterns, discovers new tools, decides whether to
 * promote to the active pool, and retires underperforming tools.
 *
 * States:  pending(观察中) → active(活跃) → cold(冷却) → retired(淘汰)
 */
import { prisma } from "../prisma";

interface ToolState {
  name: string;
  status: "pending" | "active" | "cold" | "retired";
  callCount: number;
  successCount: number;
  lastUsedAt: number;
  firstSeenAt: number;
  promotedAt?: number;
}

// In-memory cache of tool states (backed by Redis eventually)
const toolStates = new Map<string, ToolState>();

// ── Configuration ──
const OBSERVE_THRESHOLD = 20;   // calls before promotion decision
const COLD_THRESHOLD = 3600000;  // 1h without use → cold
const RETIRE_THRESHOLD = 86400000; // 24h cold → retired
const MAX_ACTIVE_TOOLS = 50;     // max tools in active pool

/** Record a tool usage event — agent observes to learn */
export function observeToolUsage(toolName: string, success: boolean): void {
  const now = Date.now();
  const state = toolStates.get(toolName) || {
    name: toolName,
    status: "pending",
    callCount: 0,
    successCount: 0,
    lastUsedAt: 0,
    firstSeenAt: now,
  };

  state.callCount++;
  if (success) state.successCount++;
  state.lastUsedAt = now;

  // Auto-promote: enough observations + good success rate
  if (state.status === "pending" && state.callCount >= OBSERVE_THRESHOLD) {
    const successRate = state.successCount / state.callCount;
    if (successRate >= 0.8) {
      state.status = "active";
      state.promotedAt = now;
      console.log(`[tool-agent] ✅ Promoted ${toolName} to active (${state.callCount} calls, ${(successRate*100).toFixed(0)}% success)`);
    } else {
      state.status = "retired";
      console.log(`[tool-agent] ❌ Retired ${toolName} (${(successRate*100).toFixed(0)}% success, below 80%)`);
    }
  }

  // Re-activate cold tools
  if (state.status === "cold") {
    state.status = "active";
  }

  toolStates.set(toolName, state);
}

/** Agent cycle — evaluates all tools and makes lifecycle decisions */
export async function runToolAgent(): Promise<string[]> {
  const now = Date.now();
  const actions: string[] = [];

  // Enforce max active tools — retire coldest
  const activeTools = [...toolStates.entries()]
    .filter(([_, s]) => s.status === "active")
    .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);

  if (activeTools.length > MAX_ACTIVE_TOOLS) {
    const toRetire = activeTools.slice(0, activeTools.length - MAX_ACTIVE_TOOLS);
    for (const [name, s] of toRetire) {
      s.status = "retired";
      actions.push(`retired:${name}(cold)`);
      console.log(`[tool-agent] 🗑️ Retired ${name} — pool overflow, coldest`);
    }
  }

  // Mark cold: active tools not used in 1h
  for (const [name, s] of toolStates) {
    if (s.status === "active" && now - s.lastUsedAt > COLD_THRESHOLD) {
      s.status = "cold";
      actions.push(`cold:${name}`);
    }
  }

  // Retire: cold tools not used in 24h
  for (const [name, s] of toolStates) {
    if (s.status === "cold" && now - s.lastUsedAt > RETIRE_THRESHOLD) {
      s.status = "retired";
      actions.push(`retired:${name}(expired)`);
      console.log(`[tool-agent] 🗑️ Retired ${name} — 24h cold`);
    }
  }

  // Persist to DB
  if (actions.length > 0) {
    await persistToolStates();
  }

  return actions;
}

/** Persist tool states to DB for cross-restart survival */
async function persistToolStates(): Promise<void> {
  try {
    const now = new Date();
    for (const [name, state] of toolStates) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ToolState" (name, status, "callCount", "successCount", "lastUsedAt", "firstSeenAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET status=$2, "callCount"=$3, "successCount"=$4, "lastUsedAt"=$5`,
        name, state.status, state.callCount, state.successCount, new Date(state.lastUsedAt), new Date(state.firstSeenAt)
      );
    }
  } catch {
    // Table might not exist yet — runs on first migration
  }
}

/** Get tool states for dashboard */
export function getToolStates(): Record<string, ToolState> {
  return Object.fromEntries(toolStates);
}

/** Get the recommended active tool list for the tool selector */
export function getActiveToolNames(): Set<string> {
  return new Set(
    [...toolStates.entries()]
      .filter(([_, s]) => s.status === "active" || s.status === "pending")
      .map(([name]) => name)
  );
}
