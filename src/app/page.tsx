"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface ProviderStatus {
  provider: string;
  status: "healthy" | "degraded" | "open";
  keyCount: number;
}

export default function Home() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    // Check auth
    fetch("/api/v1/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.email) setUser(d); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch provider status
    fetch("/health")
      .then(r => r.json())
      .then(d => {
        const list: ProviderStatus[] = [];
        for (const [p, s] of Object.entries(d.providers || {})) {
          const kh = d.keyHealth?.[p] || { active: 0 };
          list.push({ provider: p, status: s as any, keyCount: kh.active });
        }
        setProviders(list);
      })
      .catch(() => {});
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
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-8">
      {/* Hero */}
      <div className="space-y-4 max-w-lg">
        <h1 className="text-5xl font-bold tracking-tight">LLM Aggregator</h1>
        <p className="text-xl text-zinc-500">
          一个 Key，接入全部大模型。<br />
          智能路由自动选最优，省钱 70%。
        </p>
      </div>

      {/* CTA */}
      <div className="flex gap-4">
        <Link href="/register" className="rounded-lg bg-zinc-900 text-white px-8 py-3.5 font-medium hover:bg-zinc-800 text-lg">
          免费注册，即刻使用 →
        </Link>
      </div>

      {/* Provider Status */}
      {providers.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-sm text-zinc-400 mb-2">实时 Provider 状态</p>
          <div className="grid grid-cols-3 gap-2">
            {providers.map(p => (
              <div key={p.provider} className="bg-zinc-50 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5">
                <span className={"w-2 h-2 rounded-full " + (p.status === "healthy" ? "bg-green-500" : p.status === "degraded" ? "bg-yellow-500" : "bg-red-500")} />
                <span>{p.provider}</span>
                {p.keyCount > 0 && <span className="text-zinc-400 text-xs">{p.keyCount} keys</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Value Props */}
      <div className="grid grid-cols-3 gap-4 max-w-lg text-left">
        {[
          { title: "省钱 70%", desc: "智能路由自动选最便宜的模型，不牺牲质量" },
          { title: "永不掉线", desc: "7 个 Provider 自动切换，一个挂了秒切下一个" },
          { title: "零配置", desc: "注册即用，一键复制 Claude Code 配置" },
        ].map(v => (
          <div key={v.title} className="bg-zinc-50 rounded-xl p-4">
            <p className="font-bold text-sm">{v.title}</p>
            <p className="text-xs text-zinc-500 mt-1">{v.desc}</p>
          </div>
        ))}
      </div>

      {/* Models */}
      <p className="text-sm text-zinc-400">
        Claude Sonnet 5 · Opus 4.8 · Haiku 4.5 · DeepSeek V4 · Kimi K3 · GPT-5 · GLM 5.2 · 豆包 · Qwen Max
      </p>

      {/* Links */}
      <div className="flex gap-4 text-sm">
        <Link href="/login" className="text-zinc-400 hover:text-zinc-600">登录</Link>
        <Link href="/docs" className="text-zinc-400 hover:text-zinc-600">API 文档</Link>
      </div>
    </main>
  );
}
