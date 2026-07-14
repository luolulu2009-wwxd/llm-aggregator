# LLM Aggregator

**一个 API Key 调用 7 个大模型。** OpenAI 兼容，改 `base_url` 即可用。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Demo](https://img.shields.io/badge/Demo-llm.saylulu.com-blue)](https://llm.saylulu.com)

## 官网

👉 **[llm.saylulu.com](https://llm.saylulu.com)** — 注册即用，前 50 名送 ¥2 credits

## 模型

| 模型 | 输入/1M | 输出/1M |
|------|---------|--------|
| DeepSeek Chat | ¥1 | ¥2 |
| Claude Sonnet 5 | ¥21 | ¥105 |
| GPT-4o | ¥35 | ¥105 |
| Qwen Plus | ¥14 | ¥42 |
| GLM-4 Flash | ¥7 | ¥7 |
| Doubao Pro | ¥7 | ¥14 |

## 核心功能

- **OpenAI 兼容** — 改 `base_url` 即可用
- **智能路由** — `model:"auto"` 自动选模型（代码→Claude/DeepSeek，翻译→DeepSeek）
- **Key 池经济** — 贡献 API Key 赚 ×1.2 credits，可提现 USDT
- **保险池** — Key 被封赔 50%
- **自动 Fallback** — 模型挂了自动切备选
- **开发者工具** — 一键配置 Claude Code / Cursor / Windsurf
- **USDT 充提** — TRC20 网络

## 快速开始

```bash
git clone https://github.com/luolulu2009-wwxd/llm-aggregator.git
cd llm-aggregator
pnpm install
cp .env.example .env
pnpm dev
```

## 接入编程工具

```
Base URL: https://llm.saylulu.com/api/v1
API Key: sk-your-key
Model: auto (智能切换)
```

支持 Claude Code、Cursor、Windsurf、Cline、Continue.dev、Aider 等所有 OpenAI 兼容工具。详见 [接入指南](https://llm.saylulu.com/connect)。

## 技术栈

Next.js 16 · Prisma 7 · PostgreSQL · Redis · AES-256-GCM · Tailwind CSS

## 协议

**MIT** — 核心代码自由使用。增强计费和 Key 池算法为官方实例专属。

## 贡献

欢迎贡献 Provider Adapter、路由规则、安全策略。提交 PR 即可。

[![Star History Chart](https://api.star-history.com/svg?repos=luolulu2009-wwxd/llm-aggregator&type=Date)](https://star-history.com/#luolulu2009-wwxd/llm-aggregator&Date)
