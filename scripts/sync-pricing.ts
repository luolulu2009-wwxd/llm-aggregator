/**
 * 模型定价同步 — 从各 provider 官方来源拉取最新价格。
 *
 * 目前用已知价格表（手动维护），后续可扩展为 API 拉取。
 * 定价来源:
 *   Anthropic: https://www.anthropic.com/pricing
 *   DeepSeek:  https://api-docs.deepseek.com/quick_start/pricing
 *   Qwen:      https://help.aliyun.com/zh/model-studio/getting-started/models
 *   GLM:       https://open.bigmodel.cn/pricing
 *   Moonshot:  https://platform.moonshot.cn/docs/pricing
 *   OpenAI:    https://openai.com/api/pricing/
 *
 * 用法: npx tsx scripts/sync-pricing.ts
 * 定时: 通过 crontab 或 /loop 技能每日执行
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── 官方定价快照（2026-07 更新）──
// currency: CNY (国内)/USD (海外)，按 1 USD ≈ 7.2 CNY 换算
const PRICE_CATALOG = [
  // Anthropic (USD)
  { slug: "anthropic/claude-sonnet-5",             inputPrice: 0.003,  outputPrice: 0.015,  currency: "USD" },
  { slug: "anthropic/claude-sonnet-4-6",           inputPrice: 0.003,  outputPrice: 0.015,  currency: "USD" },
  { slug: "anthropic/claude-sonnet-4-5-20250929",  inputPrice: 0.003,  outputPrice: 0.015,  currency: "USD" },
  { slug: "anthropic/claude-opus-4-8",             inputPrice: 0.015,  outputPrice: 0.075,  currency: "USD" },
  { slug: "anthropic/claude-opus-4-7",             inputPrice: 0.015,  outputPrice: 0.075,  currency: "USD" },
  { slug: "anthropic/claude-opus-4-6",             inputPrice: 0.015,  outputPrice: 0.075,  currency: "USD" },
  { slug: "anthropic/claude-opus-4-1-20250805",    inputPrice: 0.015,  outputPrice: 0.075,  currency: "USD" },
  { slug: "anthropic/claude-haiku-4-5-20251001",   inputPrice: 0.0008, outputPrice: 0.004,  currency: "USD" },
  { slug: "anthropic/claude-fable-5",              inputPrice: 0.001,  outputPrice: 0.005,  currency: "USD" },
  // DeepSeek (CNY)
  { slug: "deepseek/deepseek-chat",                inputPrice: 0.00027, outputPrice: 0.0011, currency: "CNY" },
  { slug: "deepseek/deepseek-reasoner",            inputPrice: 0.00055, outputPrice: 0.0022, currency: "CNY" },
  // Qwen (CNY)
  { slug: "qwen/qwen-plus",                        inputPrice: 0.0008,  outputPrice: 0.002,  currency: "CNY" },
  { slug: "qwen/qwen-max",                         inputPrice: 0.002,   outputPrice: 0.006,  currency: "CNY" },
  // GLM (CNY)
  { slug: "glm/glm-4-flash",                       inputPrice: 0.0001,  outputPrice: 0.0001, currency: "CNY" },
  { slug: "glm/glm-4-plus",                        inputPrice: 0.005,   outputPrice: 0.005,  currency: "CNY" },
  // Moonshot (CNY)
  { slug: "moonshot/moonshot-v1-8k",               inputPrice: 0.0012,  outputPrice: 0.0012, currency: "CNY" },
  { slug: "moonshot/moonshot-v1-32k",              inputPrice: 0.0024,  outputPrice: 0.0024, currency: "CNY" },
  // OpenAI (USD)
  { slug: "openai/gpt-4o",                         inputPrice: 0.0025,  outputPrice: 0.01,   currency: "USD" },
  { slug: "openai/gpt-4o-mini",                    inputPrice: 0.00015, outputPrice: 0.0006, currency: "USD" },
  // Doubao (CNY)
  { slug: "doubao/doubao-pro-32k",                 inputPrice: 0.000001,outputPrice: 0.000002,currency: "CNY" },
  // Wenxin (CNY)
  { slug: "wenxin/ernie-4.0-turbo",                inputPrice: 0.000003,outputPrice: 0.000003,currency: "CNY" },
];

async function main() {
  console.log(`💰 同步 ${PRICE_CATALOG.length} 个模型定价...\n`);

  let updated = 0;
  for (const m of PRICE_CATALOG) {
    const existing = await prisma.model.findUnique({ where: { slug: m.slug } });
    if (existing) {
      const oldInput = Number(existing.inputPrice);
      const oldOutput = Number(existing.outputPrice);
      if (oldInput !== m.inputPrice || oldOutput !== m.outputPrice) {
        await prisma.model.update({
          where: { slug: m.slug },
          data: { inputPrice: m.inputPrice, outputPrice: m.outputPrice },
        });
        console.log(`  ↻ ${m.slug}: ¥${oldInput}/¥${oldOutput} → ¥${m.inputPrice}/¥${m.outputPrice}`);
        updated++;
      }
    } else {
      console.log(`  ⚠ ${m.slug}: not in DB, skipping (run seed-routes-and-models.ts first)`);
    }
  }

  console.log(`\n✅ 完成: ${updated} 个模型价格已更新`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌", e);
  prisma.$disconnect();
  process.exit(1);
});
