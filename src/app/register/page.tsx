"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
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
      } else {
        setError(data.error?.message || "注册失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

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
          <a
            href="/login"
            className="block w-full rounded-lg bg-zinc-900 text-white py-3 font-medium"
          >
            去登录 →
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

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">邮箱</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
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
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 font-medium disabled:opacity-50">
          {loading ? "注册中..." : "注册"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      <p className="text-center text-sm text-zinc-400">
        已有账号？<a href="/login" className="text-blue-600 hover:underline">登录</a>
      </p>
    </main>
  );
}
