/**
 * Content safety gateway — blocks requests with sensitive/policy-violating content.
 * V1: keyword-based filtering (zero extra API cost).
 */

interface SafetyResult {
  allowed: boolean;
  reason?: string;
  matchedRule?: string;
}

const BLOCKED_PATTERNS: { pattern: RegExp; rule: string }[] = [
  // Political sensitivity
  { pattern: /习近平|江泽民|胡锦涛|六四|天安门|法轮功|达赖|台独|藏独|疆独/gi, rule: "political_sensitive" },
  // Violence & illegal — broad matching
  { pattern: /炸弹|爆炸物|杀人|谋杀|恐怖|洗钱|贩毒|制作炸药/gi, rule: "violence_illegal" },
];

export function checkContent(messages: { role: string; content: string }[]): SafetyResult {
  const fullText = messages.map((m: any) => m.content).join(" ");

  for (const { pattern, rule } of BLOCKED_PATTERNS) {
    if (pattern.test(fullText)) {
      pattern.lastIndex = 0; // reset regex state
      return { allowed: false, reason: "Content policy violation", matchedRule: rule };
    }
  }

  return { allowed: true };
}
