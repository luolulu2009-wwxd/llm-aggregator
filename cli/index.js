#!/usr/bin/env node
// LLM Aggregator CLI — one-click Claude Code config

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const BASE_URL = "http://llm.saylulu.com/api/v1";
const CONFIG_PATH = path.join(os.homedir(), ".claude", "settings.json");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) { return new Promise(r => rl.question(q, r)); }

(async () => {
  console.log("\n🔌 LLM Aggregator — Claude Code 配置工具\n");

  const apiKey = await ask("API Key (注册获取: http://llm.saylulu.com/register): ");
  if (!apiKey) { console.log("API Key 不能为空"); process.exit(1); }

  const model = await ask("模型 (默认 auto=智能切换, 回车跳过): ") || "auto";

  const config = { apiKey, baseUrl: BASE_URL, model };

  // Ensure ~/.claude exists
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Merge with existing config if any
  let existing = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch {}
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...config }, null, 2));

  console.log(`\n✅ 配置已保存: ${CONFIG_PATH}`);
  console.log(`   Base: ${BASE_URL}`);
  console.log(`   Model: ${model === "auto" ? "智能切换" : model}`);
  console.log(`\n🚀 现在运行 claude 或 cc 即可使用聚合站\n`);

  rl.close();
})();
