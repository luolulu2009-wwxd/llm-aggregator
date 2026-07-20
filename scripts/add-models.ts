/**
 * 补全最新模型到数据库
 * 用法: npx tsx scripts/add-models.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("📦 补全最新模型...\n");

  const newModels = [
    // Kimi (Moonshot) — 2026 最新
    { slug: "moonshot/kimi-k2",           provider: "moonshot", name: "Kimi K2",           inputPrice: 0.006,  outputPrice: 0.012,  currency: "CNY", contextWindow: 128000, maxOutputTokens: 8192,  capabilities: "text,reasoning" },
    { slug: "moonshot/kimi-k3",           provider: "moonshot", name: "Kimi K3",           inputPrice: 0.01,   outputPrice: 0.04,   currency: "CNY", contextWindow: 200000, maxOutputTokens: 32768, capabilities: "text,code,vision,reasoning" },
    // DeepSeek — 最新
    { slug: "deepseek/deepseek-v3",       provider: "deepseek", name: "DeepSeek V3",       inputPrice: 0.00027,outputPrice: 0.0011, currency: "CNY", contextWindow: 64000,  maxOutputTokens: 8192,  capabilities: "text,code" },
    // Qwen — 最新
    { slug: "qwen/qwen-turbo",            provider: "qwen",     name: "Qwen Turbo",        inputPrice: 0.0003, outputPrice: 0.0006, currency: "CNY", contextWindow: 131072, maxOutputTokens: 8192,  capabilities: "text" },
    // OpenAI — 最新
    { slug: "openai/gpt-5",               provider: "openai",   name: "GPT-5",             inputPrice: 0.005,  outputPrice: 0.02,   currency: "USD", contextWindow: 256000, maxOutputTokens: 32768, capabilities: "text,code,vision,tool_use" },
    // Anthropic — full model lineup (some may already exist)
    { slug: "anthropic/claude-sonnet-4-6",provider: "anthropic",name: "Claude Sonnet 4.6", inputPrice: 0.003,  outputPrice: 0.015,  currency: "USD", contextWindow: 200000, maxOutputTokens: 128000, capabilities: "text,code,vision,tool_use" },
    { slug: "anthropic/claude-opus-4-8",  provider: "anthropic",name: "Claude Opus 4.8",   inputPrice: 0.015,  outputPrice: 0.075,  currency: "USD", contextWindow: 200000, maxOutputTokens: 128000, capabilities: "text,code,vision,tool_use" },
  ];

  for (const m of newModels) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: { inputPrice: m.inputPrice, outputPrice: m.outputPrice },
      create: { ...m, status: "active", sortOrder: 0 },
    });
    console.log(`✅ ${m.slug} (${m.name})`);
  }

  console.log(`\n🎉 完成！${newModels.length} 个模型`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌", e);
  prisma.$disconnect();
  process.exit(1);
});
