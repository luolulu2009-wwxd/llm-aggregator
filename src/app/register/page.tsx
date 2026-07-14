"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ apiKey?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ apiKey: data.apiKey });
        // Auto-redirect to dashboard after 2s
        setTimeout(() => router.push("/dashboard"), 2000);
      } else {
        setResult({ error: data.error?.message || "注册失败" });
      }
    } catch {
      setResult({ error: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  if (result?.apiKey) {
    // Show only success screen, no form
    return (
      <main className="max-w-md mx-auto p-6 pt-20">
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-6 space-y-3 text-center">
          <p className="text-2xl">🎉</p>
          <p className="text-green-700 dark:text-green-300 font-bold text-lg">注册成功！</p>
          <p className="text-xs text-zinc-500">API Key (请立即复制保存，仅显示一次):</p>
          <code className="block bg-white dark:bg-zinc-900 rounded px-3 py-2 text-sm font-mono break-all border select-all cursor-pointer"
            onClick={() => navigator.clipboard.writeText(result.apiKey!)}>
            {result.apiKey}
          </code>
          <p className="text-xs text-blue-600">👆 点击复制</p>
          <a href="/login" className="block w-full rounded-lg bg-zinc-900 text-white py-3 font-medium text-sm mt-4">
            去登录 →
          </a>
          <p className="text-xs text-zinc-400">已自动登录，2 秒后跳转...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-6 pt-20 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">创建账号</h1>
        <p className="text-zinc-500 mt-1">注册后获得 API Key，即可调用所有模型</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-lg border px-3 py-2" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">名称 (可选)</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder="Your Name" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder="设一个密码" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 font-medium disabled:opacity-50">
          {loading ? "注册中..." : "注册"}
        </button>
      </form>

      {result?.error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-red-600 text-sm">{result.error}</p>
        </div>
      )}
    </main>
  );
}
