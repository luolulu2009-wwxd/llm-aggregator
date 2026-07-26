/**
 * Smart Tool Selector — AI-native, self-evolving.
 *
 * Instead of truncating tools blindly, selects only the tools that
 * are relevant to the user's current request + conversation context.
 *
 * Cold start: keyword matching between user message and tool descriptions.
 * Warm state: intent-based prediction from actual usage data.
 *
 * Always keeps core tools (read, write, search, bash) regardless.
 */
const MAX_TOOLS = 30;
const CORE_TOOL_PATTERNS = [
  /read/i, /search/i, /bash/i, /command/i, /write/i, /edit/i, /file/i, /list/i, /grep/i, /find/i,
];

// ── Intent → commonly used tools heatmap (cold-start seed, evolves with data) ──
const INTENT_TOOL_SEED: Record<string, string[]> = {
  code: ["read_file", "write_file", "edit_file", "search_content", "list_files", "run_bash", "grep", "find"],
  reasoning: ["read_file", "search_content", "grep"],
  creative: ["write_file", "read_file"],
  summary: ["read_file"],
  translate: ["read_file"],
};

// Live heatmap — updated as tools are actually used
const intentToolHeatmap = new Map<string, Map<string, number>>();

// Initialize seed
for (const [intent, tools] of Object.entries(INTENT_TOOL_SEED)) {
  const map = new Map<string, number>();
  for (const t of tools) map.set(t, 5); // seed count = 5
  intentToolHeatmap.set(intent, map);
}

/** Score a tool against the user message (keyword match) */
function relevanceScore(tool: any, message: string, usedNames: Set<string>): number {
  // Already used in this conversation → always keep
  if (usedNames.has(tool.name)) return 1000;

  let score = 0;
  const lower = message.toLowerCase();
  const name = (tool.name || "").toLowerCase();
  const desc = (tool.description || tool.function?.description || "").toLowerCase();

  // Name match (high weight)
  const nameWords = name.split(/[_-]/);
  for (const w of nameWords) {
    if (w.length > 2 && lower.includes(w)) score += 10;
  }

  // Description match
  const descWords = desc.split(/\s+/).filter((w: string) => w.length > 3);
  for (const w of descWords) {
    if (lower.includes(w)) score += 2;
  }

  // Core tool bonus
  for (const pat of CORE_TOOL_PATTERNS) {
    if (pat.test(name)) { score += 5; break; }
  }

  return score;
}

/** Score by intent heatmap */
function intentScore(toolName: string, intent: string): number {
  const heatmap = intentToolHeatmap.get(intent);
  return heatmap?.get(toolName) || 0;
}

/**
 * Select relevant tools for the current request.
 * Returns trimmed tool list (max MAX_TOOLS), sorted by relevance.
 */
export function selectTools(
  tools: any[] | undefined,
  userMessage: string,
  conversationMessages: any[],
  intent?: string,
): any[] | undefined {
  if (!tools || tools.length <= MAX_TOOLS) return tools;

  // Collect tools already used in this conversation
  const usedNames = new Set<string>();
  for (const m of conversationMessages) {
    const content = Array.isArray(m.content) ? m.content : [m];
    for (const b of content) {
      if (b?.type === "tool_use" && b.name) usedNames.add(b.name);
    }
  }

  // Score each tool
  const scored = tools.map(t => ({
    tool: t,
    score: relevanceScore(t, userMessage, usedNames)
      + (intent ? intentScore(t.name, intent) : 0),
  }));

  // Sort: highest score first
  scored.sort((a, b) => b.score - a.score);

  // Always keep conversation-used tools (score >= 1000), fill rest with best matches
  const selected = scored.filter(s => s.score > 0).slice(0, MAX_TOOLS);
  return selected.map(s => s.tool);
}

/**
 * Record which tools were actually used, for self-evolution.
 * Call this after the model responds with tool_use blocks.
 */
export function recordToolUsage(intent: string | undefined, usedToolNames: string[]): void {
  if (!intent || usedToolNames.length === 0) return;

  let heatmap = intentToolHeatmap.get(intent);
  if (!heatmap) {
    heatmap = new Map();
    intentToolHeatmap.set(intent, heatmap);
  }
  for (const name of usedToolNames) {
    heatmap.set(name, (heatmap.get(name) || 0) + 1);
  }
}

/** Get the intent heatmap for dashboard/debug */
export function getToolHeatmap(): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [intent, map] of intentToolHeatmap) {
    result[intent] = Object.fromEntries(map);
  }
  return result;
}
