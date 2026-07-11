/**
 * Rule engine V1 — keyword-based intent classification.
 * Returns the recommended model slug for a given user prompt.
 */

interface RouteRule {
  intent: string;
  keywords: string[];
  targetModel: string;
  priority: number;
}

const DEFAULT_RULES: RouteRule[] = [
  {
    intent: "code",
    keywords: ["写代码", "函数", "bug", "算法", "实现", "编程", "代码", "import", "class", "function", "code", "fix", "implement", "typescript", "python", "rust", "react", "组件"],
    targetModel: "deepseek/deepseek-chat",
    priority: 10,
  },
  {
    intent: "translate",
    keywords: ["翻译", "translate", "英文", "中文", "日语", "法语", "德语", "译文"],
    targetModel: "deepseek/deepseek-chat",
    priority: 10,
  },
  {
    intent: "summary",
    keywords: ["总结", "摘要", "概括", "summarize", "tldr", "归纳", "提炼"],
    targetModel: "deepseek/deepseek-chat",
    priority: 10,
  },
  {
    intent: "creative",
    keywords: ["故事", "写文章", "剧本", "创意", "角色扮演", "小说", "诗歌", "文案", "广告语"],
    targetModel: "qwen/qwen-plus",
    priority: 10,
  },
  {
    intent: "reasoning",
    keywords: ["推理", "分析", "逻辑", "思考", "为什么", "how to", "数学", "证明", "论证"],
    targetModel: "deepseek/deepseek-chat",
    priority: 10,
  },
];

/**
 * Classify a prompt and return the recommended model.
 * Returns null if no rule matches (caller should use default).
 */
export function classifyPrompt(userMessage: string): { intent: string; targetModel: string } | null {
  const lower = userMessage.toLowerCase();

  // Sort by priority descending, then by keyword length descending (more specific first)
  const sorted = [...DEFAULT_RULES].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return 0;
  });

  for (const rule of sorted) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { intent: rule.intent, targetModel: rule.targetModel };
      }
    }
  }

  return null;
}

/** Default model when no rule matches */
export const DEFAULT_MODEL = "deepseek/deepseek-chat";

export { DEFAULT_RULES };
