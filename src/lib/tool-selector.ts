/**
 * Smart Tool Selector — AI-native, self-evolving.
 *
 * Semantic matching: embeds user message + tool descriptions, cosine similarity.
 * Falls back to keyword matching if embedding service is unavailable.
 * Self-evolving: records actual tool usage per intent, builds heatmap.
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
for (const [intent, tools] of Object.entries(INTENT_TOOL_SEED)) {
  const map = new Map<string, number>();
  for (const t of tools) map.set(t, 5);
  intentToolHeatmap.set(intent, map);
}

// ── Semantic matching via embedding ──
let getEmbeddingFn: ((text: string) => Promise<number[] | null>) | null = null;

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!getEmbeddingFn) {
    try {
      const mod = await import("./embedding");
      getEmbeddingFn = mod.getQueryEmbedding;
    } catch { getEmbeddingFn = () => Promise.resolve(null); }
  }
  return getEmbeddingFn(text);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function buildToolDescription(tool: any): string {
  const name = (tool.name || tool.function?.name || "").replace(/[_-]/g, " ");
  const desc = tool.description || tool.function?.description || "";
  return `${name}: ${desc}`.trim();
}

/** Score a tool against the user message (keyword match fallback) */
function keywordScore(tool: any, message: string, usedNames: Set<string>): number {
  if (usedNames.has(tool.name)) return 1000;

  let score = 0;
  const lower = message.toLowerCase();
  const name = (tool.name || "").toLowerCase();
  const desc = buildToolDescription(tool).toLowerCase();

  for (const w of name.split(/[_-]/)) {
    if (w.length > 2 && lower.includes(w)) score += 10;
  }
  for (const w of desc.split(/\s+/)) {
    if (w.length > 3 && lower.includes(w)) score += 2;
  }
  for (const pat of CORE_TOOL_PATTERNS) {
    if (pat.test(name)) { score += 5; break; }
  }
  return score;
}

/** Score by intent heatmap */
function intentScore(toolName: string, intent: string): number {
  return intentToolHeatmap.get(intent)?.get(toolName) || 0;
}

/**
 * Select relevant tools — semantic matching if embedding available, keyword fallback.
 */
export async function selectTools(
  tools: any[] | undefined,
  userMessage: string,
  conversationMessages: any[],
  intent?: string,
): Promise<any[] | undefined> {
  if (!tools || tools.length <= MAX_TOOLS) return tools;

  const usedNames = new Set<string>();
  for (const m of conversationMessages) {
    const content = Array.isArray(m.content) ? m.content : [m];
    for (const b of content) {
      if (b?.type === "tool_use" && b.name) usedNames.add(b.name);
    }
  }

  // Try semantic matching first
  const msgEmbedding = userMessage.length > 5 ? await getEmbedding(userMessage).catch(() => null) : null;

  const scored: { tool: any; score: number }[] = [];

  if (msgEmbedding && msgEmbedding.length > 0) {
    // Semantic: embed each tool description, compute cosine similarity
    const toolDescs = tools.map(t => buildToolDescription(t));
    const descEmbeddings = await Promise.all(
      toolDescs.map(d => d ? getEmbedding(d).catch(() => null) : null)
    );

    for (let i = 0; i < tools.length; i++) {
      let score = 0;
      // Conversation-used → always keep
      if (usedNames.has(tools[i].name)) {
        score = 1000;
      } else if (descEmbeddings[i] && descEmbeddings[i]!.length > 0) {
        score = cosineSimilarity(msgEmbedding, descEmbeddings[i]!) * 100;
      } else {
        score = keywordScore(tools[i], userMessage, new Set()); // fallback for this tool
      }
      if (intent) score += intentScore(tools[i].name, intent) * 2;
      scored.push({ tool: tools[i], score: Math.round(score) });
    }
  } else {
    // Fallback: keyword matching
    for (const t of tools) {
      scored.push({ tool: t, score: keywordScore(t, userMessage, usedNames) + (intent ? intentScore(t.name, intent) * 2 : 0) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, MAX_TOOLS).map(s => s.tool);
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
