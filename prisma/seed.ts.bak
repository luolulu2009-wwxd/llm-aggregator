import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed models
  const models = [
    { slug: "deepseek/deepseek-chat", provider: "deepseek", name: "DeepSeek Chat", inputPrice: 0.000001, outputPrice: 0.000002, contextWindow: 65536, maxOutputTokens: 8192, capabilities: "text,code" },
    { slug: "deepseek/deepseek-reasoner", provider: "deepseek", name: "DeepSeek Reasoner", inputPrice: 0.000004, outputPrice: 0.000016, contextWindow: 65536, maxOutputTokens: 8192, capabilities: "text,code,reasoning" },
    { slug: "qwen/qwen-plus", provider: "qwen", name: "Qwen Plus", inputPrice: 0.000002, outputPrice: 0.000006, contextWindow: 131072, maxOutputTokens: 8192, capabilities: "text,code,creative" },
    { slug: "glm/glm-4-flash", provider: "glm", name: "GLM-4 Flash", inputPrice: 0.000001, outputPrice: 0.000001, contextWindow: 128000, maxOutputTokens: 4096, capabilities: "text,code,summary" },
    { slug: "moonshot/moonshot-v1-8k", provider: "moonshot", name: "Moonshot v1 8K", inputPrice: 0.000003, outputPrice: 0.000003, contextWindow: 8192, maxOutputTokens: 4096, capabilities: "text" },
    { slug: "openai/gpt-4o", provider: "openai", name: "GPT-4o", inputPrice: 0.005, outputPrice: 0.015, contextWindow: 128000, maxOutputTokens: 16384, capabilities: "text,vision,code" },
    { slug: "anthropic/claude-sonnet-4-20250514", provider: "anthropic", name: "Claude Sonnet 4", inputPrice: 0.003, outputPrice: 0.015, contextWindow: 200000, maxOutputTokens: 8192, capabilities: "text,code,vision,tool_use" },
  ];

  for (const m of models) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: m,
      create: m,
    });
  }

  // Seed route rules
  const rules = [
    { intent: "code", keywords: "写代码,函数,bug,算法,实现,编程,代码,import,class,function,code,fix,implement,typescript,python,rust,react,组件", targetModel: "deepseek/deepseek-chat", priority: 10, confidence: 0.85 },
    { intent: "translate", keywords: "翻译,translate,英文,中文,日语,法语,德语,译文", targetModel: "deepseek/deepseek-chat", priority: 10, confidence: 0.9 },
    { intent: "summary", keywords: "总结,摘要,概括,summarize,tldr,归纳,提炼", targetModel: "deepseek/deepseek-chat", priority: 10, confidence: 0.9 },
    { intent: "creative", keywords: "故事,写文章,剧本,创意,角色扮演,小说,诗歌,文案,广告语", targetModel: "qwen/qwen-plus", priority: 10, confidence: 0.8 },
    { intent: "reasoning", keywords: "推理,分析,逻辑,思考,为什么,how to,数学,证明,论证,分析", targetModel: "deepseek/deepseek-reasoner", priority: 10, confidence: 0.8 },
  ];

  for (const r of rules) {
    await prisma.routeRule.upsert({
      where: { id: r.intent },
      update: r,
      create: { id: r.intent, ...r },
    });
  }

  console.log(`Seeded ${models.length} models + ${rules.length} route rules`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
