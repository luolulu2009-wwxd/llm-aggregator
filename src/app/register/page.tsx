"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setApiKey(data.apiKey);
        localStorage.setItem("apiKey", data.apiKey);
      } else {
        setError(data.error?.message || "注册失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  const ccConfig = apiKey ? `{
  "ANTHROPIC_AUTH_TOKEN": "${apiKey}",
  "ANTHROPIC_BASE_URL": "https://llm.saylulu.com/api",
  "ANTHROPIC_MODEL": "claude-sonnet-5"
}` : "";

  async function copyConfig() {
    try { await navigator.clipboard.writeText(ccConfig); } catch { /* noop */ }
  }

  const [copied, setCopied] = useState(false);

  // Success screen
  if (apiKey) {
    return (
      <main className="max-w-md mx-auto p-6 pt-20">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 space-y-4 text-center">
          <p className="text-4xl">🎉</p>
          <p className="text-green-700 font-bold text-xl">注册成功</p>
          <p className="text-sm text-zinc-500">API Key（仅显示一次，请保存）:</p>
          <div className="bg-white border rounded-lg p-3 font-mono text-sm break-all">
            {apiKey}
          </div>

          {/* Claude Code 一键配置 */}
          <div className="bg-zinc-900 text-left rounded-xl p-4 text-xs space-y-2">
            <p className="text-green-400 font-medium">Claude Code 一键配置</p>
            <pre className="text-green-300 overflow-x-auto whitespace-pre-wrap">{ccConfig}</pre>
            <button
              onClick={async () => { await copyConfig(); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="rounded-lg bg-green-600 text-white px-4 py-1.5 text-sm font-medium"
            >
              {copied ? "✅ 已复制" : "📋 复制配置"}
            </button>
            <p className="text-zinc-400 text-[10px]">粘贴到 VSCode 的 .claude/settings.json 即可使用</p>
          </div>

          <a
            href="/login"
            className="block w-full rounded-lg bg-zinc-900 text-white py-3 font-medium"
          >
            去 Dashboard →
          </a>
        </div>
      </main>
    );
  }

  // Register form
  return (
    <main className="max-w-md mx-auto p-6 pt-20 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">创建账号</h1>
        <p className="text-zinc-500 mt-1">注册后获得 API Key</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">邮箱</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">名称 (可选)</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">密码</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder="设一个密码" />
        </div>
        <button onClick={handleRegister} disabled={loading}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 font-medium disabled:opacity-50">
          {loading ? "注册中..." : "注册"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      <p className="text-center text-sm text-zinc-400">
        已有账号？<a href="/login" className="text-blue-600 hover:underline">登录</a>
      </p>
    </main>
  );
}
