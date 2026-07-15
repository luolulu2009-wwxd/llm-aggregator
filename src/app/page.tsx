"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.email) setUser(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-5">
        <h1 className="text-3xl font-bold">欢迎回来，{user.email}</h1>
        <p className="text-zinc-500">你的 AI 聚合站已就绪</p>
        <div className="flex gap-4">
          <Link href="/dashboard" className="rounded-lg bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-800">
            进入控制台 →
          </Link>
          <Link href="/connect" className="rounded-lg border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-50">
            接入工具
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-6">
      <h1 className="text-5xl font-bold tracking-tight">LLM Aggregator</h1>
      <p className="text-xl text-zinc-500 max-w-md">
        一个 API Key，调用 7 个大模型。智能路由，自动切换。
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="rounded-lg bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-800">
          开始使用 →
        </Link>
        <Link href="/register" className="rounded-lg border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-50">
          注册
        </Link>
      </div>
      <div className="flex gap-3 text-sm text-zinc-400">
        <span>DeepSeek</span><span>·</span><span>Claude Sonnet 5</span><span>·</span>
        <span>GPT-4o</span><span>·</span><span>Qwen</span><span>·</span>
        <span>GLM-4</span><span>·</span><span>Doubao</span>
      </div>
    </main>
  );
}
