/**
 * 模型更新 — 2026年7月最新模型清单
 *
 * 来源:
 *   DeepSeek: api-docs.deepseek.com/news/news260424 (V4 Preview)
 *   GLM/智谱: docs.bigmodel.cn/cn/guide/start/model-overview
 *   Kimi: platform.moonshot.cn
 *
 * 用法: npx tsx scripts/update-models-202607.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("📦 更新为 2026-07 最新模型...\n");

  // ── DeepSeek V4 系列（2026年4月发布）──
  // ⚠️ 旧 API 名 deepseek-chat / deepseek-reasoner 2026-07-24 停用
  const deepseekModels = [
    { slug: "deepseek/deepseek-v4-pro",   name: "DeepSeek V4 Pro",   inputPrice: 0.0125, outputPrice: 0.025,  contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
    { slug: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", inputPrice: 0.0025, outputPrice: 0.005,  contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning" },
  ];

  // ── GLM 最新系列 ──
  // GLM-5 旗舰 + GLM-4.7 当前代
  const glmModels = [
    { slug: "glm/glm-5.2",          name: "GLM-5.2",           inputPrice: 0.015,  outputPrice: 0.03,   contextWindow: 1048576, maxOutputTokens: 128000, capabilities: "text,code,reasoning" },
    { slug: "glm/glm-5.1",          name: "GLM-5.1",           inputPrice: 0.01,   outputPrice: 0.02,   contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
    { slug: "glm/glm-5-turbo",      name: "GLM-5 Turbo",       inputPrice: 0.005,  outputPrice: 0.01,   contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,code,agent" },
    { slug: "glm/glm-4.7",          name: "GLM-4.7",           inputPrice: 0.005,  outputPrice: 0.01,   contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,code,reasoning,tool_use" },
    { slug: "glm/glm-4.7-flash",    name: "GLM-4.7 Flash",     inputPrice: 0.0001, outputPrice: 0.0001, contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text" },
    { slug: "glm/glm-4.7-flashx",   name: "GLM-4.7 FlashX",    inputPrice: 0.0001, outputPrice: 0.0001, contextWindow: 200000,  maxOutputTokens: 128000, capabilities: "text,reasoning" },
  ];

  const allModels = [...deepseekModels, ...glmModels];

  for (const m of allModels) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: { inputPrice: m.inputPrice, outputPrice: m.outputPrice, contextWindow: m.contextWindow, capabilities: m.capabilities },
      create: { ...m, provider: m.slug.split("/")[0], currency: "CNY", status: "active", sortOrder: 0 },
    });
    console.log(`✅ ${m.slug} (${m.name})`);
  }

  // 标记旧模型为 inactive（可选）
  console.log("\n⚠️  旧模型（可手动禁用）:");
  const oldModels = ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner", "glm/glm-4-flash", "glm/glm-4-plus"];
  for (const slug of oldModels) {
    const m = await prisma.model.findUnique({ where: { slug } });
    if (m) console.log(`  ${slug} — 状态: ${m.status}, 7/24 DeepSeek 旧 API 停用`);
  }

  console.log(`\n🎉 完成！${allModels.length} 个模型`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌", e);
  prisma.$disconnect();
  process.exit(1);
});
