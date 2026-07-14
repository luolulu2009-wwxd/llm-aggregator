"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError(data.error?.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-sm mx-auto p-6 pt-20 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="text-zinc-500 mt-1">LLM 聚合站</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-lg border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full rounded-lg border px-3 py-2" />
        </div>
        <button onClick={handleLogin} disabled={loading}
          className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 font-medium disabled:opacity-50">
          {loading ? "登录中..." : "登录"}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>}

      <p className="text-center text-sm text-zinc-400">
        还没有账号？<a href="/register" className="text-blue-600 hover:underline">注册</a>
      </p>
    </main>
  );
}
