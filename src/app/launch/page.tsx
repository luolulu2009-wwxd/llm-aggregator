"use client";

import { useState } from "react";

const PLATFORMS = [
  {
    id: "v2ex", name: "V2EX", url: "https://www.v2ex.com/new/create", node: "分享创造",
    title: "LLM聚合站——7个模型一个API Key，贡献Key还能赚credits",
    content: `做了一个多月，终于能用了。

痛点：我们团队同时用DeepSeek、Claude、GPT-4o、Qwen、GLM、Doubao——每个都要单独注册、充值、管Key。切模型要在代码里改SDK。

解决方案：https://llm.saylulu.com

一个OpenAI兼容的API端点，背后聚合了7个模型。设 model:"auto" 自动根据任务选模型——写代码→Claude/DeepSeek，翻译→DeepSeek。

核心功能：
- 智能路由：自动选最合适的模型
- 自动Fallback：主模型挂了自动切备选
- 贡献Key赚credits：上传API Key到池子，别人用你赚×1.2
- Key被封赔50%：保险池机制
- USDT充提：支持TRC20
- 一键接入Claude Code/Cursor/Windsurf

技术栈：Next.js 16 + Prisma + PostgreSQL + Redis
GitHub：https://github.com/luolulu2009-wwxd/llm-aggregator (MIT)

前50个注册送¥2 credits。欢迎试用反馈。`,
  },
  {
    id: "twitter1", name: "Twitter (英文)", url: "https://x.com/compose/post",
    title: "",
    content: `Just shipped: LLM Aggregator — 1 API key, 7 models

DeepSeek · Claude Sonnet 5 · GPT-4o · Qwen Plus · GLM-4 · Doubao

- model:"auto" = smart routing
- Auto fallback if a model fails
- Contribute your API keys → earn ×1.2 credits
- USDT deposits & withdrawals

Open source (MIT): https://github.com/luolulu2009-wwxd/llm-aggregator
Try it: https://llm.saylulu.com

#BuildInPublic #LLM #OpenSource`,
  },
  {
    id: "twitter2", name: "Twitter (中文)", url: "https://x.com/compose/post",
    title: "",
    content: `做了个LLM聚合站：一个API Key调7个模型，模型挂了自动切换

DeepSeek · Claude · GPT-4o · Qwen · GLM · Doubao
用 model:"auto" 自动选模型
贡献Key还能赚×1.2 credits

开源MIT：https://github.com/luolulu2009-wwxd/llm-aggregator
试试：https://llm.saylulu.com`,
  },
  {
    id: "juejin", name: "掘金", url: "https://juejin.cn/editor/drafts/new",
    title: "如何用Next.js搭建一个LLM聚合平台——从0到上线全记录",
    content: `## 背景

团队日常开发中同时使用 DeepSeek、Claude、GPT-4o、Qwen、GLM、Doubao 等大模型。每个模型都要单独注册、充值、管理 API Key。切换模型时要改代码里的 SDK 配置。Claude 的额度经常不够用。

于是做了一个聚合平台。

## 技术架构

- Next.js 16 + Turbopack
- Prisma 7 + PostgreSQL
- Redis 速率限制
- AES-256-GCM Key 加密
- 6 个 Provider Adapter（OpenAI 兼容 + Anthropic 原生格式）
- Undici ProxyAgent 代理链路

## 核心设计

### 智能路由
不指定模型时，规则引擎根据提示词自动分类：代码→Claude/DeepSeek，翻译→DeepSeek，创作→Qwen。规则可动态配置。

### Key 池经济
用户贡献 API Key → 别人使用 → 贡献者获得 ×1.2 credits 奖励 → Credits 可消费或提现 USDT。保险池赔付被 ban 的 Key。

### 防滥用
- 注册IP限频
- 自成交检测
- 收益异常统计检测
- 信任等级渐进（L0-L3）

## 开源

GitHub MIT 协议: https://github.com/luolulu2009-wwxd/llm-aggregator

欢迎 Star 和 PR。`,
  },
  {
    id: "reddit", name: "Reddit r/selfhosted", url: "https://www.reddit.com/r/selfhosted/submit",
    title: "LLM Aggregator — self-hosted OpenAI-compatible API for 7 models",
    content: `Open source (MIT) LLM API aggregator — one key, 7 models.

- OpenAI-compatible endpoint
- Smart routing (model:"auto")
- Key pooling with credit rewards
- AES-256-GCM encrypted key storage
- USDT payments (TRC20)

GitHub: https://github.com/luolulu2009-wwxd/llm-aggregator
Demo: https://llm.saylulu.com

Built with Next.js 16 + Prisma + PostgreSQL. Looking for feedback and contributors.`,
  },
];

export default function LaunchPage() {
  const [copied, setCopied] = useState("");

  function copy(text: string, id: string) {
    // Use both modern and legacy clipboard APIs
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  function fallbackCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed"; el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">🚀 推广发布面板</h1>
        <p className="text-zinc-500 mt-1">一键复制 → 粘贴到各平台 → 发布</p>
      </div>

      {PLATFORMS.map(p => (
        <div key={p.id} className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{p.name}</span>
              <a href={p.url} target="_blank" className="text-xs text-blue-600 hover:underline">
                打开发布页 ↗
              </a>
            </div>
            <button
              onClick={() => copy(p.title ? `**${p.title}**\n\n${p.content}` : p.content, p.id)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                copied === p.id ? "bg-green-100 text-green-700" : "bg-zinc-900 text-white"
              }`}
            >
              {copied === p.id ? "✓ 已复制" : "📋 复制内容"}
            </button>
          </div>

          {/* Title */}
          {p.title && (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {p.id === "v2ex" && `节点: ${p.node} · `}
              标题: {p.title}
            </p>
          )}

          {/* Content preview */}
          <pre className="bg-zinc-50 dark:bg-zinc-950 border rounded-lg p-4 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {p.content.slice(0, 300)}{p.content.length > 300 ? "..." : ""}
          </pre>
        </div>
      ))}

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-center">
        💡 建议发布顺序：掘金(写长文) → Twitter(中英文) → Reddit → V2EX
      </div>
    </main>
  );
}
