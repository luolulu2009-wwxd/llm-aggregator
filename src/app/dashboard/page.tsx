"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface UserInfo { email: string; name: string; creditBalance: number; trustLevel: string }
interface AccountData {
  balance: number; trustLevel: string;
  todayUsage: { promptTokens: number; completionTokens: number; cost: number };
  transactions: { id: string; amount: number; type: string; description: string; createdAt: string }[];
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/auth/me").then(r => r.json()).then(d => {
      if (d.email) {
        setUser(d);
        loadApiKey();
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  async function loadApiKey() {
    try {
      const res = await fetch("/api/v1/auth/keys");
      const d = await res.json();
      if (d.apiKey) {
        setApiKey(d.apiKey);
        loadAccount(d.apiKey);
      }
    } catch { setLoading(false); }
  }

  async function loadAccount(key: string) {
    try {
      const res = await fetch("/api/v1/account", { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  // Manual API key mode
  async function fetchWithKey() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/v1/account", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error("API Key 无效");
      setData(await res.json());
      setUser({ email: "API Key 用户", name: "", creditBalance: 0, trustLevel: "-" });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {user && <p className="text-sm text-zinc-500">{user.email} · {user.trustLevel}</p>}
        </div>
        {user && <Link href="/dashboard/keys" className="text-sm text-blue-600 hover:underline">管理 Key →</Link>}
      </header>

      {!user && (
        <div className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-3">
          <p className="text-sm font-medium">输入 API Key 查看 Dashboard</p>
          <div className="flex gap-2">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..." className="flex-1 rounded-lg border px-3 py-2 font-mono text-sm" />
            <button onClick={fetchWithKey} disabled={loading}
              className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
              查询
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            <Link href="/login" className="hover:underline">登录</Link> 后自动显示，无需手动输入
          </p>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="余额" value={`¥${data.balance.toFixed(4)}`} />
            <Card label="等级" value={data.trustLevel} />
            <Card label="今日 Token" value={`${((data.todayUsage.promptTokens + data.todayUsage.completionTokens) / 1000).toFixed(0)}K`} />
            <Card label="今日费用" value={`¥${data.todayUsage.cost.toFixed(4)}`} />
          </div>

          <section>
            <h2 className="text-lg font-semibold mb-3">最近交易</h2>
            <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-2">类型</th>
                    <th className="text-right px-4 py-2">金额</th>
                    <th className="text-left px-4 py-2">说明</th>
                    <th className="text-right px-4 py-2">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.slice(0, 15).map(tx => (
                    <tr key={tx.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2"><TxBadge type={tx.type} /></td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${Number(tx.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 text-xs">{tx.description || "-"}</td>
                      <td className="px-4 py-2 text-right text-zinc-400 text-xs">{new Date(tx.createdAt).toLocaleString("zh-CN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="bg-white dark:bg-zinc-900 border rounded-xl p-4">
    <p className="text-xs text-zinc-500 mb-1">{label}</p>
    <p className="text-xl font-bold font-mono">{value}</p>
  </div>;
}

function TxBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    topup: "bg-green-100 text-green-700", deduct: "bg-red-100 text-red-700",
    contribution: "bg-blue-100 text-blue-700", refund: "bg-zinc-100 text-zinc-600",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-zinc-100"}`}>{type}</span>;
}
