/**
 * Anthropic 智能路由 — 数据库迁移脚本
 * 
 * 1. 激活 anthropic-default provider key（如果存在且 pending）
 * 2. 添加 Anthropic 模型定价
 * 
 * 用法: npx tsx scripts/migrate-anthropic.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 开始 Anthropic 智能路由迁移...\n');

  // ── 1. 激活 anthropic-default key ──
  const result = await prisma.providerKey.updateMany({
    where: {
      provider: 'anthropic',
      modelFamily: 'anthropic-default',
      status: 'pending',
    },
    data: { status: 'active' },
  });

  if (result.count > 0) {
    console.log(`✅ 激活了 ${result.count} 个 anthropic-default key`);
  } else {
    console.log('ℹ️  没有需要激活的 anthropic-default key（可能已激活或不存在）');
  }

  // ── 2. 添加/更新 Anthropic 模型定价 ──
  const models = [
    { slug: 'anthropic/claude-sonnet-5',          provider: 'anthropic', name: 'Claude Sonnet 5',          inputPrice: 0.003,  outputPrice: 0.015,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-sonnet-4-6',        provider: 'anthropic', name: 'Claude Sonnet 4.6',        inputPrice: 0.003,  outputPrice: 0.015,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-sonnet-4-5-20250929',provider: 'anthropic', name: 'Claude Sonnet 4.5',        inputPrice: 0.003,  outputPrice: 0.015,  contextWindow: 200000, maxOutputTokens: 64000,  capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-opus-4-8',          provider: 'anthropic', name: 'Claude Opus 4.8',          inputPrice: 0.015,  outputPrice: 0.075,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-opus-4-7',          provider: 'anthropic', name: 'Claude Opus 4.7',          inputPrice: 0.015,  outputPrice: 0.075,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-opus-4-6',          provider: 'anthropic', name: 'Claude Opus 4.6',          inputPrice: 0.015,  outputPrice: 0.075,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-opus-4-1-20250805', provider: 'anthropic', name: 'Claude Opus 4.1',          inputPrice: 0.015,  outputPrice: 0.075,  contextWindow: 200000, maxOutputTokens: 32000,  capabilities: 'text,code,vision,tool_use' },
    { slug: 'anthropic/claude-haiku-4-5-20251001',provider: 'anthropic', name: 'Claude Haiku 4.5',         inputPrice: 0.0008, outputPrice: 0.004,  contextWindow: 200000, maxOutputTokens: 64000,  capabilities: 'text,vision' },
    { slug: 'anthropic/claude-fable-5',           provider: 'anthropic', name: 'Claude Fable 5',           inputPrice: 0.001,  outputPrice: 0.005,  contextWindow: 200000, maxOutputTokens: 128000, capabilities: 'text,code,vision,tool_use' },
  ];

  for (const m of models) {
    await prisma.model.upsert({
      where: { slug: m.slug },
      update: m,
      create: { ...m, currency: 'CNY', status: 'active', sortOrder: 0 },
    });
    console.log(`✅ ${m.slug}`);
  }

  console.log(`\n🎉 迁移完成！共处理 ${models.length} 个模型`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 迁移失败:', e);
  prisma.$disconnect();
  process.exit(1);
});
