/**
 * Smart Complexity Classifier — cross-provider, cost-optimal, language-aware.
 *
 * Scores message complexity (0-100), detects language (zh/en/mixed),
 * and picks the best model across ALL providers.
 *
 * Each tier has a ranked candidate list.
 * CN language → CN-native providers first (Kimi, GLM, Qwen, Doubao, DeepSeek).
 * EN language → EN-strong providers first (Anthropic, OpenAI).
 */

// ── Cross-provider model candidates per tier ──
// Ordered by quality preference (language-aware reorder applied at runtime)
const TIER_CANDIDATES: Record<number, string[]> = {
  0: [ // trivial: hi, hello → 速度优先 (直连, 不走隧道)
    "deepseek/deepseek-v4-flash",             // V4 Flash — 直连 fastest
    "moonshot/moonshot-v1-8k",                // Kimi v1 — 直连 CN
    "glm/glm-4.7-flash",                      // GLM Flash — 直连免费
    "doubao/doubao-seed-evolving",            // 豆包 — 直连
  ],
  1: [ // simple: basic Q&A → 低成本
    "moonshot/moonshot-v1-8k",                // Kimi v1 — best CN value
    "deepseek/deepseek-v4-pro",               // V4 Pro
    "doubao/doubao-seed-2-1-pro",             // 豆包 2.1
    "qwen/qwen-max-latest",                   // Qwen Max
    "glm/glm-4.7",                            // GLM 4.7
    "openrouter/claude-sonnet-5",              // Sonnet 5
  ],
  2: [ // moderate: explanation, writing
    "moonshot/kimi-k3",                       // Kimi K3 — best CN writing
    "deepseek/deepseek-v4-pro",               // V4 Pro
    "doubao/doubao-seed-2-1-pro",             // 豆包 2.1
    "openrouter/claude-sonnet-5",              // Sonnet 5
    "glm/glm-5.1",                            // GLM 5.1
    "openai/gpt-5",                           // GPT-5
  ],
  3: [ // complex: code, analysis
    "openrouter/claude-sonnet-5",             // Claude via OpenRouter
    "openrouter/claude-sonnet-5",              // Claude direct
    "moonshot/kimi-k3",                       // Kimi K3 — 强推理
    "deepseek/deepseek-v4-pro",               // V4 Pro
    "openrouter/gpt-5",                       // GPT-5 via OpenRouter
    "glm/glm-5.2",                            // GLM 5.2
    "anthropic/claude-opus-4-8",              // Opus upgrade
  ],
  4: [ // deep: advanced reasoning → maximum quality
    "openrouter/claude-opus-4-8",             // Claude Opus via OpenRouter
    "anthropic/claude-opus-4-8",              // Claude direct
    "moonshot/kimi-k3",                       // Kimi K3
    "openrouter/gpt-5",                       // GPT-5 via OpenRouter
    "deepseek/deepseek-v4-pro",               // V4 Pro
    "glm/glm-5.2",                            // GLM 5.2
  ],
};

// ── Model pricing (CNY per token) ──
const PRICING: Record<string, { input: number; output: number; provider: string }> = {
  // Anthropic (USD at 7.2)
  "anthropic/claude-haiku-4-5-20251001": { input: 0.00576, output: 0.0288,  provider: "Anthropic" },
  "openrouter/claude-sonnet-5":           { input: 0.0216,  output: 0.108,   provider: "Anthropic" },
  "anthropic/claude-opus-4-8":           { input: 0.108,   output: 0.54,    provider: "Anthropic" },
  "anthropic/claude-fable-5":            { input: 0.0072,  output: 0.036,   provider: "Anthropic" },
  // DeepSeek
  "deepseek/deepseek-v4-pro":            { input: 0.0125,  output: 0.025,   provider: "DeepSeek" },
  "deepseek/deepseek-v4-flash":          { input: 0.0025,  output: 0.005,   provider: "DeepSeek" },
  "deepseek/deepseek-chat":              { input: 0.00027, output: 0.0011,  provider: "DeepSeek" },
  // Kimi (per-token pricing, CNY)
  "moonshot/kimi-k3":                    { input: 0.0000216, output: 0.000108, provider: "Kimi" },
  "moonshot/kimi-k2-7-code":            { input: 0.00000684,output: 0.0000288,provider: "Kimi" },
  "moonshot/moonshot-v1-8k":             { input: 0.0012,  output: 0.0012,  provider: "Kimi" },
  // GLM
  "glm/glm-5.2":                        { input: 0.015,   output: 0.03,    provider: "GLM" },
  "glm/glm-5.1":                        { input: 0.01,    output: 0.02,    provider: "GLM" },
  "glm/glm-4.7":                        { input: 0.005,   output: 0.01,    provider: "GLM" },
  "glm/glm-4.7-flash":                  { input: 0.0001,  output: 0.0001,  provider: "GLM" },
  // Qwen
  "qwen/qwen-max-latest":               { input: 0.002,   output: 0.006,   provider: "Qwen" },
  "qwen/qwen-plus-latest":              { input: 0.0008,  output: 0.002,   provider: "Qwen" },
  "qwen/qwen-turbo-latest":             { input: 0.0003,  output: 0.0006,  provider: "Qwen" },
  // Doubao
  "doubao/doubao-seed-2-1-pro":         { input: 0.0012,  output: 0.0048,  provider: "豆包" },
  "doubao/doubao-seed-evolving":        { input: 0.001,   output: 0.004,   provider: "豆包" },
  // OpenAI
  "openai/gpt-5":                       { input: 0.036,   output: 0.144,   provider: "OpenAI" },
  "openai/gpt-4o":                      { input: 0.018,   output: 0.072,   provider: "OpenAI" },
  // OpenRouter (same models, different provider)
  "openrouter/claude-sonnet-5":         { input: 0.0216,  output: 0.108,   provider: "OpenRouter" },
  "openrouter/claude-opus-4-8":         { input: 0.108,   output: 0.54,    provider: "OpenRouter" },
  "openrouter/claude-haiku-4-5":        { input: 0.00576, output: 0.0288,  provider: "OpenRouter" },
  "openrouter/claude-fable-5":          { input: 0.0072,  output: 0.036,   provider: "OpenRouter" },
  "openrouter/gpt-5":                   { input: 0.036,   output: 0.144,   provider: "OpenRouter" },
};

export interface ClassificationResult {
  score: number;
  tier: number;
  complexity: "trivial" | "simple" | "moderate" | "complex" | "deep";
  language: "zh" | "en" | "mixed";
  candidates: string[];
  primaryModel: string;
  estimatedCost: number;
}

// ── Complexity scoring ──

const SIGNALS = {
  high: [
    { words: ["代码", "函数", "bug", "算法", "实现", "编程", "import", "class", "function", "code", "fix", "implement", "typescript", "python", "rust", "react", "debug", "refactor", "architecture"], weight: 35 },
    { words: ["推理", "证明", "论证", "分析", "为什么", "how to", "数学", "公式", "逻辑", "reasoning", "theorem", "proof", "analyze"], weight: 30 },
  ],
  medium: [
    { words: ["解释", "说明", "explain", "describe", "elaborate", "详细", "具体"], weight: 15 },
    { words: ["比较", "对比", "compare", "versus", "vs", "difference", "区别"], weight: 20 },
  ],
  trivial: [
    { words: ["hi", "hello", "hey", "你好", "谢谢", "thanks", "ok", "okay", "bye", "goodbye", "再见", "好的", "对", "是", "no", "yes", "嗯", "哦"], weight: -15 },
  ],
};

function scoreMessage(message: string, conversationLength: number): number {
  const lower = message.toLowerCase();
  let score = 20;
  const len = message.length;
  if (len < 10) score += 0;
  else if (len < 50) score += 10;
  else if (len < 200) score += 20;
  else if (len < 1000) score += 25;
  else score += 30;
  if (conversationLength > 2000) score += 15;
  else if (conversationLength > 500) score += 10;
  else if (conversationLength > 100) score += 5;
  for (const group of [SIGNALS.high, SIGNALS.medium, SIGNALS.trivial]) {
    for (const { words, weight } of group) {
      for (const word of words) if (lower.includes(word)) { score += weight; break; }
    }
  }
  return Math.max(0, Math.min(100, score));
}

// ── Language detection ──

function detectLanguage(message: string): "zh" | "en" | "mixed" {
  let zhChars = 0, enChars = 0;
  for (const ch of message) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) zhChars++;
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) enChars++;
  }
  if (zhChars > enChars * 2) return "zh";
  if (enChars > zhChars * 2) return "en";
  return "mixed";
}

function languageReorder(candidates: string[], language: "zh" | "en" | "mixed"): string[] {
  const cnProviders = ["moonshot", "doubao", "glm", "qwen", "deepseek"];
  const enProviders = ["anthropic", "openai"];
  if (language === "zh") {
    const cn = candidates.filter(c => cnProviders.includes(c.split("/")[0]));
    const rest = candidates.filter(c => !cnProviders.includes(c.split("/")[0]));
    return [...cn, ...rest];
  }
  if (language === "en") {
    const dsv4 = candidates.filter(c => c.startsWith("deepseek/"));
    const en = candidates.filter(c => enProviders.includes(c.split("/")[0]));
    const rest = candidates.filter(c => !dsv4.includes(c) && !en.includes(c));
    return [...dsv4, ...en, ...rest];
  }
  return candidates;
}

// ── Main classifier ──

export function classifyComplexity(
  message: string,
  conversationLength: number = 0,
): ClassificationResult {
  const score = scoreMessage(message, conversationLength);
  let tier: number;
  let complexity: ClassificationResult["complexity"];
  if (score <= 15)       { tier = 0; complexity = "trivial"; }
  else if (score <= 35)  { tier = 1; complexity = "simple"; }
  else if (score <= 60)  { tier = 2; complexity = "moderate"; }
  else if (score <= 80)  { tier = 3; complexity = "complex"; }
  else                   { tier = 4; complexity = "deep"; }

  const language = detectLanguage(message);
  // Note: No static reordering! Weight Engine learns language preferences from data.
  const candidates = [...TIER_CANDIDATES[tier]];
  // ε-greedy shuffle breaks ties → exploration → system self-evolves
  candidates.sort(() => Math.random() - 0.5);
  const primaryModel = candidates[0];
  const pricing = PRICING[primaryModel] || { input: 0.01, output: 0.04 };
  const estimatedInputTokens = Math.ceil(message.length / 2);
  const estimatedCost = pricing.input * estimatedInputTokens + pricing.output * 100;

  return { score, tier, complexity, language, candidates, primaryModel, estimatedCost: Math.round(estimatedCost * 1e6) / 1e6 };
}

export function costSavings(usedModel: string, messageLength: number): { saved: number; percent: number } {
  const used = PRICING[usedModel];
  if (!used) return { saved: 0, percent: 0 };
  const best = PRICING["anthropic/claude-opus-4-8"];
  const tokens = Math.ceil(messageLength / 2) + 100;
  const usedCost = used.input * tokens;
  const bestCost = best.input * tokens;
  const saved = Math.max(0, bestCost - usedCost);
  return { saved: Math.round(saved * 1e6) / 1e6, percent: bestCost > 0 ? Math.round((saved / bestCost) * 100) : 0 };
}
