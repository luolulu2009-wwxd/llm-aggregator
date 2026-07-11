"use client";

import { useState, useEffect } from "react";

interface AccountData {
  balance: number;
  trustLevel: string;
  todayUsage: {
    promptTokens: number;
    completionTokens: number;
    cost: number;
  };
  transactions: {
    id: string;
    amount: number;
    type: string;
    description: string;
    balanceAfter: number;
    createdAt: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchData(key: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/account", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || "Failed");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">LLM Aggregator</h1>
        <p className="text-zinc-500">一个 Key，所有模型</p>
      </header>

      {/* API Key Input */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-3">
        <label className="block text-sm font-medium">API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={() => fetchData(apiKey)}
            disabled={loading || !apiKey}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Loading..." : "查询"}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {data && (
        <>
          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="余额" value={`¥${data.balance.toFixed(4)}`} />
            <StatCard label="信任等级" value={data.trustLevel} />
            <StatCard label="今日 Token" value={`${((data.todayUsage.promptTokens + data.todayUsage.completionTokens) / 1000).toFixed(0)}K`} />
            <StatCard label="今日费用" value={`¥${data.todayUsage.cost.toFixed(4)}`} />
          </div>

          {/* Transactions */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">交易记录</h2>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
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
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2">
                        <TxBadge type={tx.type} />
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${Number(tx.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(6)}
                      </td>
                      <td className="px-4 py-2 text-zinc-500">{tx.description}</td>
                      <td className="px-4 py-2 text-right text-zinc-400">{new Date(tx.createdAt).toLocaleString("zh-CN")}</td>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function TxBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    topup: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    deduct: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    contribution: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    insurance_payout: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    refund: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-zinc-100"}`}>
      {type}
    </span>
  );
}
