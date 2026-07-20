/**
 * Route engine v2 — keyword + semantic hybrid.
 *
 * 1. Keyword match: fast, deterministic, no API call
 * 2. Semantic match: embedding cosine similarity against rule embeddings
 * 3. Fallback: DEFAULT_MODEL
 */
import { prisma } from "./prisma";

const FALLBACK_RULES = [
  { intent: "code", keywords: "代码,函数,bug,算法,实现,编程,import,class,function,code,fix,implement,typescript,python,rust,react,组件", targetModel: "deepseek/deepseek-chat", priority: 10 },
  { intent: "translate", keywords: "翻译,translate,英文,中文,日语,法语,德语,译文", targetModel: "deepseek/deepseek-chat", priority: 10 },
  { intent: "summary", keywords: "总结,摘要,概括,summarize,tldr,归纳,提炼", targetModel: "deepseek/deepseek-chat", priority: 10 },
  { intent: "creative", keywords: "故事,写文章,剧本,创意,角色扮演,小说,诗歌,文案,广告语", targetModel: "qwen/qwen-plus", priority: 10 },
  { intent: "reasoning", keywords: "推理,分析,逻辑,思考,为什么,how to,数学,证明,论证", targetModel: "deepseek/deepseek-chat", priority: 10 },
];

interface Rule {
  intent: string;
  keywords: string[];
  targetModel: string;
  priority: number;
  embedding?: number[] | null;
}

let cachedRules: Rule[] | null = null;
let cacheTime = 0;

async function loadRules(): Promise<Rule[]> {
  if (cachedRules && Date.now() - cacheTime < 60000) return cachedRules;

  try {
    const dbRules = await prisma.routeRule.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });
    if (dbRules.length > 0) {
      cachedRules = dbRules.map(r => ({
        intent: r.intent,
        keywords: r.keywords.split(",").map(k => k.trim()),
        targetModel: r.targetModel,
        priority: r.priority,
        // embedding column is Unsupported type — access via raw if needed
      }));
      cacheTime = Date.now();
      return cachedRules;
    }
  } catch {}

  cachedRules = FALLBACK_RULES.map(r => ({
    ...r,
    keywords: r.keywords.split(",").map(k => k.trim()),
  }));
  cacheTime = Date.now();
  return cachedRules;
}

/**
 * Keyword match — returns the first rule whose keywords match the message.
 */
function keywordMatch(rules: Rule[], message: string): { intent: string; targetModel: string; confidence: number } | null {
  const lower = message.toLowerCase();
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { intent: rule.intent, targetModel: rule.targetModel, confidence: 0.85 };
      }
    }
  }
  return null;
}

/**
 * Semantic match — cosine similarity between query embedding and rule embeddings.
 * `queryEmbedding` is the pre-computed embedding of the user message.
 * `ruleEmbeddings` maps intent → pre-computed embedding of the rule's representative text.
 */
function semanticMatch(
  queryEmbedding: number[],
  ruleEmbeddings: Map<string, number[]>,
  rules: Rule[],
): { intent: string; targetModel: string; confidence: number } | null {
  let bestScore = 0;
  let bestRule: Rule | null = null;

  for (const rule of rules) {
    const emb = ruleEmbeddings.get(rule.intent);
    if (!emb) continue;
    const score = cosineSimilarity(queryEmbedding, emb);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (bestRule && bestScore > 0.25) {
    return { intent: bestRule.intent, targetModel: bestRule.targetModel, confidence: bestScore };
  }
  return null;
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

/**
 * Pre-computed embeddings for fallback rules (generated offline).
 * These are the embeddings of the KEYWORDS string for each rule.
 * In production, these would be stored in the DB.
 */
const FALLBACK_EMBEDDINGS = new Map<string, number[]>(); // populated at seed time

/**
 * Load rule embeddings from DB or use empty map.
 */
async function loadRuleEmbeddings(): Promise<Map<string, number[]>> {
  // Try loading from DB first
  try {
    const rules = await prisma.$queryRawUnsafe<Array<{ intent: string; embedding: string }>>(
      `SELECT intent, embedding::text FROM "RouteRule" WHERE embedding IS NOT NULL AND "isActive" = true`
    );
    if (rules.length > 0) {
      const map = new Map<string, number[]>();
      for (const r of rules) {
        try {
          // pg vector::text returns "[0.1,0.2,...]" or "(0.1,0.2,...)"
          const cleaned = r.embedding
            .replace(/[\[\]()]/g, "")  // remove brackets and parens
            .split(",")
            .map(Number)
            .filter(n => !isNaN(n));
          if (cleaned.length > 0) map.set(r.intent, cleaned);
        } catch {}
      }
      if (map.size > 0) return map;
    }
  } catch {}

  // Fallback: return pre-computed embeddings (seeded below)
  return FALLBACK_EMBEDDINGS;
}

/**
 * Main classification — hybrid keyword + semantic.
 *
 * @param userMessage - the user's message content
 * @param queryEmbedding - optional pre-computed embedding of the message (for semantic match)
 */
export async function classifyPrompt(
  userMessage: string,
  queryEmbedding?: number[] | null,
): Promise<{ intent: string; targetModel: string; confidence: number } | null> {
  const rules = await loadRules();
  if (rules.length === 0) return null;

  // 1. Keyword match (fast, deterministic)
  const kw = keywordMatch(rules, userMessage);
  if (kw && kw.confidence >= 0.85) {
    incrementHitCount(kw.intent).catch(() => {});
    return kw;
  }

  // 2. Semantic match (if embedding available)
  if (queryEmbedding && queryEmbedding.length > 0) {
    const ruleEmbeddings = await loadRuleEmbeddings();
    if (ruleEmbeddings.size > 0) {
      const sm = semanticMatch(queryEmbedding, ruleEmbeddings, rules);
      if (sm) {
        incrementHitCount(sm.intent).catch(() => {});
        return sm;
      }
    }
  }

  // 3. Low-confidence keyword fallback
  if (kw) {
    incrementHitCount(kw.intent).catch(() => {});
    return kw;
  }

  return null;
}

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5"; // Falls back to DeepSeek when no Anthropic key

// ── Analytics ──

async function incrementHitCount(intent: string) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "RouteRule" SET "hitCount" = COALESCE("hitCount", 0) + 1 WHERE intent = $1`,
      intent,
    );
  } catch {}
}

export async function getRouteStats() {
  try {
    return await prisma.$queryRawUnsafe<Array<{ intent: string; targetModel: string; hitCount: number; isActive: boolean }>>(
      `SELECT intent, "targetModel", COALESCE("hitCount", 0) as "hitCount", "isActive" FROM "RouteRule" ORDER BY "hitCount" DESC`
    );
  } catch {
    return [];
  }
}
