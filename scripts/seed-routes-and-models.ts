/**
 * 智能路由优化 + 模型定价补全
 *
 * 1. RouteRules 指向 Anthropic 模型（根据意图选最佳 Claude 模型）
 * 2. 补全缺失的 provider 模型定价（DeepSeek/Qwen/GLM/Moonshot/OpenAI）
 *
 * 用法: npx tsx scripts/seed-routes-and-models.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 智能路由优化...\n");

  // ── 1. 更新 RouteRules → Anthropic 模型 ──
  const routeUpdates = [
    { intent: "code",       targetModel: "anthropic/claude-sonnet-5", priority: 10, keywords: "代码,函数,bug,算法,实现,编程,import,class,function,code,fix,implement,typescript,python,rust,react,组件" },
    { intent: "reasoning",  targetModel: "anthropic/claude-opus-4-8", priority: 10, keywords: "推理,分析,逻辑,思考,为什么,how to,数学,证明,论证" },
    { intent: "translate",  targetModel: "anthropic/claude-haiku-4-5-20251001", priority: 10, keywords: "翻译,translate,英文,中文,日语,法语,德语,译文" },
    { intent: "summary",    targetModel: "anthropic/claude-haiku-4-5-20251001", priority: 10, keywords: "总结,摘要,概括,summarize,tldr,归纳,提炼" },
    { intent: "creative",   targetModel: "anthropic/claude-sonnet-5", priority: 10, keywords: "故事,写文章,剧本,创意,角色扮演,小说,诗歌,文案,广告语" },
  ];

  for (const r of routeUpdates) {
    const existing = await prisma.routeRule.findFirst({ where: { intent: r.intent } });
    if (existing) {
      await prisma.routeRule.update({
        where: { id: existing.id },
        data: { targetModel: r.targetModel, priority: r.priority, keywords: r.keywords },
      });
      console.log(`✅ ${r.intent} → ${r.targetModel} (updated)`);
    } else {
      await prisma.routeRule.create({
        data: {
          intent: r.intent,
          keywords: r.keywords,
          targetModel: r.targetModel,
          priority: r.priority,
          isActive: true,
        },
      });
      console.log(`✅ ${r.intent} → ${r.targetModel} (created)`);
    }
  }

  // ── 2. 补全缺失的 provider 模型定价 ──
  console.log("\n💰 补全模型定价...\n");

  const missingModels = [
    // DeepSeek
    { slug: "deepseek/deepseek-chat",     provider: "deepseek", name: "DeepSeek V3",        inputPrice: 0.00027, outputPrice: 0.0011, currency: "CNY" },
    { slug: "deepseek/deepseek-reasoner", provider: "deepseek", name: "DeepSeek R1",        inputPrice: 0.00055, outputPrice: 0.0022, currency: "CNY" },
    // Qwen (通义千问)
    { slug: "qwen/qwen-plus",             provider: "qwen",     name: "Qwen Plus",           inputPrice: 0.0008,  outputPrice: 0.002,  currency: "CNY" },
    { slug: "qwen/qwen-max",              provider: "qwen",     name: "Qwen Max",            inputPrice: 0.002,   outputPrice: 0.006,  currency: "CNY" },
    // GLM (智谱)
    { slug: "glm/glm-4-flash",            provider: "glm",      name: "GLM-4 Flash",         inputPrice: 0.0001,  outputPrice: 0.0001, currency: "CNY" },
    { slug: "glm/glm-4-plus",             provider: "glm",      name: "GLM-4 Plus",          inputPrice: 0.005,   outputPrice: 0.005,  currency: "CNY" },
    // Moonshot (月之暗面)
    { slug: "moonshot/moonshot-v1-8k",    provider: "moonshot", name: "Moonshot v1 8K",      inputPrice: 0.0012,  outputPrice: 0.0012, currency: "CNY" },
    { slug: "moonshot/moonshot-v1-32k",   provider: "moonshot", name: "Moonshot v1 32K",     inputPrice: 0.0024,  outputPrice: 0.0024, currency: "CNY" },
    // OpenAI
    { slug: "openai/gpt-4o",              provider: "openai",   name: "GPT-4o",              inputPrice: 0.0025,  outputPrice: 0.01,   currency: "USD" },
    { slug: "openai/gpt-4o-mini",         provider: "openai",   name: "GPT-4o Mini",         inputPrice: 0.00015, outputPrice: 0.0006, currency: "USD" },
  ];

  for (const m of missingModels) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: m,
      create: { ...m, status: "active", sortOrder: 0, contextWindow: 128000, maxOutputTokens: 4096, capabilities: "text" },
    });
    console.log(`✅ ${m.slug}`);
  }

  console.log(`\n🎉 完成！${routeUpdates.length} 个路由规则 + ${missingModels.length} 个模型定价`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ 失败:", e);
  prisma.$disconnect();
  process.exit(1);
});
