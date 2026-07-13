"use client";

import { useState } from "react";

const CATEGORIES = [
  {
    name: "编程 AI",
    tools: [
      { id: "claude-code", name: "Claude Code", setup: "settings.json", file: "~/.claude/settings.json" },
      { id: "cursor", name: "Cursor", setup: "Settings JSON", file: "Cursor → Settings" },
      { id: "windsurf", name: "Windsurf", setup: "Settings", file: "Settings → Models" },
      { id: "cline", name: "Cline (VSCode)", setup: "Provider Settings", file: "VSCode → Cline" },
      { id: "continue", name: "Continue.dev", setup: "config.json", file: "~/.continue/config.json" },
      { id: "aider", name: "Aider", setup: "env / .aider.conf.yml", file: "terminal" },
      { id: "copilot", name: "GitHub Copilot", setup: "不支持自定义", file: "⚠️ 用 Cursor 替代" },
    ],
  },
  {
    name: "通用 AI 工具",
    tools: [
      { id: "open-interpreter", name: "Open Interpreter", setup: "env vars", file: "terminal" },
      { id: "shell-gpt", name: "Shell GPT", setup: "env vars", file: "~/.config/shell_gpt" },
      { id: "chatgpt-app", name: "ChatGPT 桌面", setup: "第三方客户端", file: "如 ChatBox, LobeChat" },
    ],
  },
];

export default function ConnectPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("auto");
  const [activeTool, setActiveTool] = useState("claude-code");
  const [copied, setCopied] = useState("");

  const baseUrl = "https://llm.saylulu.com/api/v1";
  const key = apiKey || "sk-your-key";
  const mdl = model === "auto" ? "auto" : model;

  const universal = {
    baseUrl,
    apiKey: key,
    model: mdl,
  };

  // Generate config for each tool type
  function getConfig(toolId: string): string {
    const base = `# 三行配置，接入所有模型
API Base URL: ${baseUrl}
API Key: ${key}
Model: ${mdl}${mdl === "auto" ? " (智能切换，或手动指定)" : ""}`;

    switch (toolId) {
      case "claude-code":
        return `${base}

# ~/.claude/settings.json
{
  "apiKey": "${key}",
  "baseUrl": "${baseUrl}",
  "model": "${mdl}"
}`;
      case "cursor":
        return `${base}

# Cursor Settings → Models → OpenAI API Key
{
  "openai.apiKey": "${key}",
  "openai.baseUrl": "${baseUrl}"
}`;
      case "cline":
        return `${base}

# VSCode Cline → API Provider: OpenAI Compatible
API Key: ${key}
Base URL: ${baseUrl}
Model: ${mdl}`;
      case "continue":
        return `${base}

# ~/.continue/config.json
{
  "models": [{
    "title": "LLM Aggregator",
    "provider": "openai",
    "apiBase": "${baseUrl}",
    "apiKey": "${key}",
    "model": "${mdl}"
  }]
}`;
      case "aider":
        return `${base}

# Terminal
export OPENAI_API_BASE="${baseUrl}"
export OPENAI_API_KEY="${key}"
aider --model openai/${mdl}`;
      case "open-interpreter":
        return `${base}

# Terminal
export OPENAI_API_BASE="${baseUrl}"
export OPENAI_API_KEY="${key}"
interpreter --model ${mdl}`;
      case "shell-gpt":
        return `${base}

# ~/.config/shell_gpt/.sgptrc
OPENAI_API_BASE=${baseUrl}
OPENAI_API_KEY=${key}
DEFAULT_MODEL=${mdl}`;
      default:
        return base;
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(activeTool);
    setTimeout(() => setCopied(""), 2000);
  }

  const config = getConfig(activeTool);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">接入 LLM Aggregator</h1>
        <p className="text-zinc-500 mt-1">
          所有兼容 OpenAI API 的工具都能用——一个 Key，7 个模型，智能切换
        </p>
      </div>

      {/* Universal Config */}
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-4 text-sm">
        <p className="font-medium text-green-700 dark:text-green-300 mb-2">🎯 通用三步 — 适用于所有 OpenAI 兼容工具</p>
        <div className="grid grid-cols-3 gap-3 text-xs text-green-600 dark:text-green-400">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-bold">1. Base URL</span>
            <code className="block mt-1 font-mono">{baseUrl}</code>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-bold">2. API Key</span>
            <code className="block mt-1 font-mono text-xs truncate">{key}</code>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-bold">3. Model</span>
            <code className="block mt-1 font-mono">{mdl}</code>
            <span className="text-[10px]">auto=智能切换</span>
          </div>
        </div>
      </div>

      {/* Config Generator */}
      <div className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <input value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="输入你的 API Key..." className="flex-1 min-w-[200px] rounded-lg border px-3 py-2 text-sm font-mono" />
          <select value={model} onChange={e => setModel(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm">
            <option value="auto">auto (智能)</option>
            <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
            <option value="anthropic/claude-sonnet-5">Claude Sonnet 5</option>
            <option value="openai/gpt-4o">GPT-4o</option>
            <option value="qwen/qwen-plus">Qwen Plus</option>
            <option value="glm/glm-4-flash">GLM-4 Flash</option>
            <option value="doubao/ep-20260713152918-q8zxn">Doubao</option>
          </select>
        </div>

        {/* Tool Tabs */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <div key={cat.name} className="w-full">
              <p className="text-xs text-zinc-400 mt-3 mb-1 ml-1">{cat.name}</p>
              <div className="flex flex-wrap gap-1">
                {cat.tools.map(t => (
                  <button key={t.id} onClick={() => setActiveTool(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTool === t.id
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}>
                    {t.name}
                    {t.id === "copilot" && " ⚠️"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Config output */}
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">
              {CATEGORIES.flatMap(c => c.tools).find(t => t.id === activeTool)?.setup || "Settings"}
              {" · "}
              {CATEGORIES.flatMap(c => c.tools).find(t => t.id === activeTool)?.file || ""}
            </span>
          </div>
          <pre className="bg-zinc-950 text-green-400 p-4 rounded-xl text-xs overflow-x-auto"><code>{config}</code></pre>
          <button onClick={() => copy(config)}
            className="absolute top-8 right-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded font-medium">
            {copied === activeTool ? "✓ 已复制" : "📋 复制配置"}
          </button>
        </div>
      </div>

      {/* Smart routing card */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm space-y-2">
        <p className="font-medium">🤖 model: "auto" 智能路由</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-medium">写代码</span>
            <p className="text-zinc-500">DeepSeek / Claude</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-medium">翻译/摘要</span>
            <p className="text-zinc-500">DeepSeek</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-medium">推理分析</span>
            <p className="text-zinc-500">Claude / DeepSeek-R1</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
            <span className="font-medium">创作/文案</span>
            <p className="text-zinc-500">Qwen / Claude</p>
          </div>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          主模型挂了自动切备选——设置 <code>models: ["deepseek/deepseek-chat"]</code>
        </p>
      </div>
    </main>
  );
}
