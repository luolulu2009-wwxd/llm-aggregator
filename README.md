# LLM Aggregator

**一个 Key，所有模型。** OpenAI 兼容的统一 API 端点，聚合国内外大模型。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 核心功能

- **OpenAI 兼容** — 改 `base_url` 即可用
- **智能路由** — 自动根据任务类型选模型（代码/翻译/推理/…）
- **Key 池** — 贡献多余 Key，共享额度
- **自动 Fallback** — 模型挂了自动切备选
- **多 Provider** — DeepSeek, Claude, Qwen, GLM, Moonshot, OpenAI
- **内容安全** — 敏感词过滤
- **Web 控制台** — 用量仪表盘 + Key 管理

## 快速开始

```bash
git clone https://github.com/luolulu2009-wwxd/llm-aggregator.git
cd llm-aggregator
pnpm install
cp .env.example .env
pnpm dev
```

## 架构

```
用户请求 → Auth → Safety → Rate Limit
  → 规则引擎选模型 → Key 池选 Key → Adapter 翻译
    → Provider API → 返回
```

## 项目结构

```
src/
├── app/api/v1/
│   ├── chat/completions/   # 核心端点
│   ├── models/              # 模型列表
│   ├── account/             # 余额+充值
│   ├── admin/keys/          # Key 管理
│   └── register/            # 注册
├── lib/
│   ├── adapters/             # Provider 适配器
│   ├── auth.ts / crypto.ts  # 认证 + 加密
│   ├── billing.ts / keys.ts # 计费 + Key 池
│   ├── router.ts / safety.ts # 路由 + 安全
│   └── trust.ts / health.ts # 信任 + 健康检查
└── app/
    ├── dashboard/            # 用量仪表盘
    └── register/             # 注册页
```

## 协议

**MIT** — 核心代码自由使用。增强计费和 Key 池算法为官方实例专属。

## 贡献

欢迎贡献 Provider Adapter、路由规则。提交 PR 即可。
