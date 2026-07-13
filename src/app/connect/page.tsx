"use client";

import { useState, useEffect } from "react";

const TOOLS = [
  { id: "claude-code", name: "Claude Code", icon: "CC" },
  { id: "cursor", name: "Cursor", icon: "↗" },
  { id: "windsurf", name: "Windsurf", icon: "~" },
  { id: "cline", name: "Cline", icon: "|>" },
  { id: "copilot", name: "GitHub Copilot", icon: "GH" },
];

export default function ConnectPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("auto");
  const [tool, setTool] = useState("claude-code");
  const [user, setUser] = useState<any>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/v1/auth/me").then(r => r.json()).then(d => {
      if (d.email) setUser(d);
    });
  }, []);

  const baseUrl = "http://llm.saylulu.com/api/v1";

  const configs: Record<string, string> = {
    "claude-code": `# ~/.claude/settings.json
{
  "apiKey": "${apiKey || "sk-your-key"}",
  "baseUrl": "${baseUrl}",
  "model": "${model === 'auto' ? 'auto' : model}"
}`,
    "cursor": `# Cursor Settings → Models → Add Custom Model
# Or set in Cursor settings JSON:
{
  "openai.apiKey": "${apiKey || "sk-your-key"}",
  "openai.baseUrl": "${baseUrl}",
  "openai.model": "${model === 'auto' ? 'auto' : model}"
}`,
    "windsurf": `# Windsurf Settings
{
  "apiKey": "${apiKey || "sk-your-key"}",
  "baseUrl": "${baseUrl}",
  "model": "${model === 'auto' ? 'auto' : model}"
}`,
    "cline": `# VSCode Cline Settings
{
  "apiProvider": "openai",
  "apiKey": "${apiKey || "sk-your-key"}",
  "openAiBaseUrl": "${baseUrl}",
  "openAiModel": "${model === 'auto' ? 'auto' : model}"
}`,
    "copilot": `# GitHub Copilot cannot use custom endpoints.
# Use Cursor or Cline with our API instead.`,
  };

  function copy(text: string, name: string) {
    navigator.clipboard.writeText(text);
    setCopied(name);
    setTimeout(() => setCopied(""), 2000);
  }

  const curlExample = `curl -X POST ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${apiKey || "sk-your-key"}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"写一个快排"}]}'`;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">接入编程工具</h1>
        <p className="text-zinc-500 mt-1">一键配置 Claude Code / Cursor / Windsurf 使用聚合站</p>
      </div>

      {/* Config Generator */}
      <div className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">配置生成器</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..." className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">模型</label>
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="auto">auto — 智能切换</option>
              <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
              <option value="anthropic/claude-sonnet-5">Claude Sonnet 5</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="qwen/qwen-plus">Qwen Plus</option>
              <option value="glm/glm-4-flash">GLM-4 Flash</option>
              <option value="doubao/ep-20260713152918-q8zxn">Doubao</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">编程工具</label>
            <select value={tool} onChange={e => setTool(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              {TOOLS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="relative">
          <pre className="bg-zinc-950 text-green-400 p-4 rounded-xl text-xs overflow-x-auto"><code>{configs[tool]}</code></pre>
          <button onClick={() => copy(configs[tool], "config")}
            className="absolute top-2 right-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded">
            {copied === "config" ? "已复制 ✓" : "复制"}
          </button>
        </div>

        <div className="text-xs text-zinc-400 space-y-1">
          <p>• 设 <code>model: "auto"</code> 自动根据任务智能选模型——代码→DeepSeek/Claude, 翻译→DeepSeek</p>
          <p>• 手动指定备用模型: <code>"models": ["deepseek/deepseek-chat"]</code> 主模型挂了自动切</p>
        </div>
      </div>

      {/* Quick curl */}
      <div className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold">cURL 示例</h2>
        <div className="relative">
          <pre className="bg-zinc-950 text-green-400 p-4 rounded-xl text-xs overflow-x-auto"><code>{curlExample}</code></pre>
          <button onClick={() => copy(curlExample, "curl")}
            className="absolute top-2 right-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded">
            {copied === "curl" ? "已复制 ✓" : "复制"}
          </button>
        </div>
      </div>

      {/* Smart routing explainer */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm space-y-2">
        <p className="font-medium text-blue-700 dark:text-blue-300">智能路由如何工作</p>
        <div className="text-blue-600 dark:text-blue-400 text-xs space-y-1">
          <p>🎯 写代码 → DeepSeek / Claude (成本低 + 能力强)</p>
          <p>🌐 翻译/摘要 → DeepSeek (最高性价比)</p>
          <p>🧠 推理/分析 → Claude (最强推理)</p>
          <p>✨ 创作/文案 → Qwen (中文创作好)</p>
          <p>🔄 模型挂了 → 自动切备选模型</p>
        </div>
      </div>
    </main>
  );
}
