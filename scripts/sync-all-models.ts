/**
 * 全量模型同步 — 2026年7月最新, 与各 provider 官方 API 名完全对齐
 *
 * 来源:
 *   Kimi:     api.moonshot.ai/v1/models → kimi-k3, moonshot-v1-8k, etc.
 *   DeepSeek: api-docs.deepseek.com → deepseek-v4-pro, deepseek-v4-flash
 *   GLM:      docs.bigmodel.cn → glm-5.2, glm-4.7-flash, etc.
 *   Qwen:     alibabacloud.com/help/en/model-studio → qwen3.6-plus, qwen-max-latest
 *   Doubao:   volcengine.com/docs/82379 → doubao-seed-2-1-pro, doubao-seed-evolving
 *   OpenAI:   platform.openai.com → gpt-5, gpt-4o
 *   Anthropic: docs.anthropic.com → claude-sonnet-5, etc.
 *
 * 用法: npx tsx scripts/sync-all-models.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOG = [
  // ── Kimi / Moonshot (CNY) ──
  { slug: "moonshot/kimi-k3",              name: "Kimi K3",              inputPrice: 0.108, outputPrice: 0.54,  contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,vision,reasoning" },
  { slug: "moonshot/kimi-k2-7-code",       name: "Kimi K2.7 Code",      inputPrice: 0.014,  outputPrice: 0.0288, contextWindow: 256000,  maxOutputTokens: 128000, capabilities: "text,code" },
  { slug: "moonshot/moonshot-v1-8k",       name: "Kimi v1 8K",          inputPrice: 0.0012, outputPrice: 0.0012, contextWindow: 8000,    maxOutputTokens: 4096,   capabilities: "text" },
  { slug: "moonshot/moonshot-v1-32k",      name: "Kimi v1 32K",         inputPrice: 0.0024, outputPrice: 0.0024, contextWindow: 32000,   maxOutputTokens: 4096,   capabilities: "text" },

  // ── DeepSeek (CNY → USD at ~7.2) ──
  { slug: "deepseek/deepseek-v4-pro",      name: "DeepSeek V4 Pro",     inputPrice: 0.0125, outputPrice: 0.025,  contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
  { slug: "deepseek/deepseek-v4-flash",    name: "DeepSeek V4 Flash",   inputPrice: 0.0025, outputPrice: 0.005,  contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning" },
  { slug: "deepseek/deepseek-chat",        name: "DeepSeek V3 (legacy)",inputPrice: 0.00027,outputPrice: 0.0011, contextWindow: 64000,   maxOutputTokens: 8192,   capabilities: "text,code" },
  { slug: "deepseek/deepseek-reasoner",    name: "DeepSeek R1 (legacy)",inputPrice: 0.00055,outputPrice: 0.0022, contextWindow: 64000,   maxOutputTokens: 8192,   capabilities: "text,reasoning" },

  // ── GLM / 智谱 (CNY) ──
  { slug: "glm/glm-5.2",                  name: "GLM-5.2",             inputPrice: 0.015,  outputPrice: 0.03,   contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning" },
  { slug: "glm/glm-5.1",                  name: "GLM-5.1",             inputPrice: 0.01,   outputPrice: 0.02,   contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
  { slug: "glm/glm-4.7",                  name: "GLM-4.7",             inputPrice: 0.005,  outputPrice: 0.01,   contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
  { slug: "glm/glm-4.7-flash",            name: "GLM-4.7 Flash",       inputPrice: 0.0001, outputPrice: 0.0001, contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text" },

  // ── Qwen / 通义千问 (CNY) ──
  { slug: "qwen/qwen-max-latest",         name: "Qwen Max",            inputPrice: 0.002,  outputPrice: 0.006,  contextWindow: 32768,   maxOutputTokens: 8192,   capabilities: "text,reasoning" },
  { slug: "qwen/qwen-plus-latest",        name: "Qwen Plus",           inputPrice: 0.0008, outputPrice: 0.002,  contextWindow: 32768,   maxOutputTokens: 8192,   capabilities: "text" },
  { slug: "qwen/qwen-turbo-latest",       name: "Qwen Turbo",          inputPrice: 0.0003, outputPrice: 0.0006, contextWindow: 32768,   maxOutputTokens: 8192,   capabilities: "text" },

  // ── Doubao / 豆包 (CNY) ──
  { slug: "doubao/doubao-seed-2-1-pro",    name: "豆包 Seed 2.1 Pro",  inputPrice: 0.0012, outputPrice: 0.0048, contextWindow: 131072,  maxOutputTokens: 32768,  capabilities: "text,code,agent" },
  { slug: "doubao/doubao-seed-evolving",   name: "豆包 Seed Evolving", inputPrice: 0.001,  outputPrice: 0.004,  contextWindow: 131072,  maxOutputTokens: 32768,  capabilities: "text,code,agent" },
  { slug: "doubao/doubao-pro-32k",         name: "豆包 Pro 32K",       inputPrice: 0.000001,outputPrice: 0.000002,contextWindow: 32768,  maxOutputTokens: 4096,   capabilities: "text" },

  // ── Wenxin / 百度文心 (CNY) ──
  { slug: "wenxin/ernie-4.0-turbo",        name: "ERNIE 4.0 Turbo",   inputPrice: 0.000003,outputPrice: 0.000003,contextWindow: 8192,   maxOutputTokens: 2048,   capabilities: "text" },

  // ── OpenAI (USD → CNY at 7.2) ──
  { slug: "openai/gpt-5",                  name: "GPT-5",              inputPrice: 0.036,  outputPrice: 0.144,  contextWindow: 256000,  maxOutputTokens: 32768,  capabilities: "text,code,vision,tool_use" },
  { slug: "openai/gpt-4o",                 name: "GPT-4o",             inputPrice: 0.018,  outputPrice: 0.072,  contextWindow: 128000,  maxOutputTokens: 16384,  capabilities: "text,code,vision,tool_use" },

  // ── Anthropic (USD → CNY at 7.2) ──
  { slug: "anthropic/claude-sonnet-5",              name: "Claude Sonnet 5",   inputPrice: 0.0216,  outputPrice: 0.108,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: "text,code,vision,tool_use" },
  { slug: "anthropic/claude-opus-4-8",              name: "Claude Opus 4.8",   inputPrice: 0.108,   outputPrice: 0.54,   contextWindow: 200000, maxOutputTokens: 128000, capabilities: "text,code,vision,tool_use" },
  { slug: "anthropic/claude-haiku-4-5-20251001",    name: "Claude Haiku 4.5",  inputPrice: 0.00576, outputPrice: 0.0288, contextWindow: 200000, maxOutputTokens: 64000,  capabilities: "text,vision" },
  { slug: "anthropic/claude-fable-5",               name: "Claude Fable 5",    inputPrice: 0.0072,  outputPrice: 0.036,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: "text,code,vision,tool_use" },
].map(m => ({ ...m, provider: m.slug.split("/")[0], currency: (m.slug.startsWith("anthropic/") || m.slug.startsWith("openai/")) ? "USD" : "CNY", status: "active", sortOrder: 0 }));

async function main() {
  console.log(`🔄 同步 ${CATALOG.length} 个模型...\n`);

  for (const m of CATALOG) {
    const { provider, currency, status, sortOrder, ...modelData } = m;
    await prisma.model.upsert({
      where: { slug: modelData.slug },
      update: {
        name: modelData.name,
        inputPrice: modelData.inputPrice,
        outputPrice: modelData.outputPrice,
        contextWindow: modelData.contextWindow,
        maxOutputTokens: modelData.maxOutputTokens,
        capabilities: modelData.capabilities,
      },
      create: { ...modelData, provider, currency, status, sortOrder },
    });
    console.log(`✅ ${m.slug}`);
  }

  console.log(`\n🎉 完成！${CATALOG.length} 个模型已同步`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
