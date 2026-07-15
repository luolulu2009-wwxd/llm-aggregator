"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface UserInfo { email: string; name: string; creditBalance: number; trustLevel: string }
interface AccountData {
  balance: number; trustLevel: string;
  todayUsage: { promptTokens: number; completionTokens: number; cost: number };
  transactions: { id: string; amount: number; type: string; description: string; createdAt: string }[];
}
interface StatsData {
  days: { date: string; tokens: number; cost: number }[];
  models: { slug: string; cost: number; tokens: number }[];
  totalEarned: number;
}
interface ApiKeyInfo { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState<AccountData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // API Key management
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/me").then(r => r.json()).then(d => {
      if (d.email) { setUser(d); loadData(); loadApiKeys(); }
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadData() {
    try {
      const [accRes, statsRes] = await Promise.all([
        fetch("/api/v1/account"),
        fetch("/api/v1/account/stats"),
      ]);
      if (accRes.ok) setData(await accRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
    setLoading(false);
  }

  async function loadApiKeys() {
    try {
      const res = await fetch("/api/v1/auth/keys");
      if (res.ok) setApiKeys((await res.json()).data || []);
    } catch {}
  }

  async function generateApiKey() {
    setGenerating(true); setGeneratedKey(""); setError("");
    try {
      const res = await fetch("/api/v1/auth/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || undefined }),
      });
      const d = await res.json();
      if (res.ok) { setGeneratedKey(d.apiKey); setNewKeyName(""); loadApiKeys(); }
      else setError(d.error?.message || "生成失败");
    } catch { setError("网络错误"); }
    setGenerating(false);
  }

  async function manualFetch() {
    setLoading(true);
    try {
      const [accRes] = await Promise.all([
        fetch("/api/v1/account", { headers: { Authorization: `Bearer ${apiKey}` } }),
        fetch("/api/v1/account/stats", { headers: { Authorization: `Bearer ${apiKey}` } }),
      ]);
      if (accRes.ok) setData(await accRes.json());
    } catch {}
    setLoading(false);
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {user && <p className="text-sm text-zinc-500">{user.email}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/docs" className="text-xs text-blue-600 hover:underline">API 文档</Link>
          <Link href="/dashboard/keys" className="text-xs text-blue-600 hover:underline">贡献 Key</Link>
        </div>
      </header>

      {!user && (
        <div className="bg-zinc-50 border rounded-xl p-6 space-y-3">
          <p className="font-medium">输入 API Key 查看 Dashboard</p>
          <div className="flex gap-2">
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..." className="flex-1 rounded-lg border px-3 py-2 font-mono text-sm" />
            <button onClick={manualFetch} className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm font-medium">查询</button>
          </div>
          <p className="text-xs text-zinc-400"><Link href="/login" className="hover:underline">登录</Link> 后自动显示</p>
        </div>
      )}

      {data && (
        <>
          {/* Balance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card label="余额" value={`¥${data.balance.toFixed(4)}`} />
            <Card label="贡献收益" value={stats ? `¥${stats.totalEarned.toFixed(4)}` : "-"} highlight />
            <Card label="今日 Token" value={`${((data.todayUsage.promptTokens + data.todayUsage.completionTokens) / 1000).toFixed(0)}K`} />
            <Card label="今日费用" value={`¥${data.todayUsage.cost.toFixed(6)}`} />
            <Card label="等级" value={data.trustLevel} />
          </div>

          {/* API Keys */}
          <section>
            <h2 className="text-lg font-semibold mb-3">API Keys</h2>
            {apiKeys.length > 0 ? (
              <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                    <tr>
                      <th className="text-left px-4 py-2">名称</th>
                      <th className="text-left px-4 py-2">前缀</th>
                      <th className="text-left px-4 py-2">创建时间</th>
                      <th className="text-left px-4 py-2">最后使用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(k => (
                      <tr key={k.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{k.name || "-"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{k.prefix}***</td>
                        <td className="px-4 py-2 text-zinc-500 text-xs">{new Date(k.createdAt).toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-2 text-zinc-400 text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("zh-CN") : "未使用"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-zinc-400 mb-4">暂无 API Key</p>
            )}

            {/* Generate new key */}
            {generatedKey ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                <p className="text-green-700 font-medium text-sm">✅ Key 已生成（仅显示一次，请立即复制保存）</p>
                <div className="flex gap-2">
                  <input type="text" readOnly value={generatedKey}
                    className="flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-sm" />
                  <button onClick={() => { navigator.clipboard.writeText(generatedKey); }}
                    className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm">复制</button>
                </div>
                <button onClick={() => setGeneratedKey("")}
                  className="text-xs text-zinc-500 hover:underline">关闭</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                  placeholder="Key 名称（可选）" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                <button onClick={generateApiKey} disabled={generating}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50">
                  {generating ? "生成中..." : "生成新 Key"}
                </button>
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </section>

          {/* 7-day trend */}
          {stats && stats.days.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">7 天用量趋势</h2>
              <div className="bg-white dark:bg-zinc-900 border rounded-xl p-4">
                <div className="flex items-end gap-2 h-32">
                  {stats.days.map((d, i) => {
                    const maxTokens = Math.max(...stats.days.map(x => x.tokens), 1);
                    const height = Math.max(4, (d.tokens / maxTokens) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${(d.tokens / 1000).toFixed(0)}K tokens, ¥${d.cost.toFixed(4)}`}>
                        <span className="text-[10px] text-zinc-400">{d.cost > 0 ? `¥${d.cost.toFixed(2)}` : ""}</span>
                        <div className="w-full bg-blue-500 rounded-t" style={{ height: `${height}%` }} />
                        <span className="text-[10px] text-zinc-400">{d.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Model distribution */}
          {stats && stats.models.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">模型使用分布</h2>
              <div className="bg-white dark:bg-zinc-900 border rounded-xl p-4 space-y-2">
                {stats.models.map(m => {
                  const totalCost = stats.models.reduce((s, x) => s + x.cost, 0) || 1;
                  const pct = (m.cost / totalCost) * 100;
                  return (
                    <div key={m.slug} className="flex items-center gap-3 text-sm">
                      <span className="w-36 font-mono text-xs truncate">{m.slug}</span>
                      <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-4 overflow-hidden">
                        <div className="bg-green-500 h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs text-zinc-500">{pct.toFixed(0)}% · ¥{m.cost.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Transactions */}
          <section>
            <h2 className="text-lg font-semibold mb-3">最近交易</h2>
            <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                  <tr><th className="text-left px-4 py-2">类型</th><th className="text-right px-4 py-2">金额</th><th className="text-left px-4 py-2">说明</th><th className="text-right px-4 py-2">时间</th></tr>
                </thead>
                <tbody>
                  {data.transactions.slice(0, 10).map(tx => (
                    <tr key={tx.id} className="border-t">
                      <td className="px-4 py-2"><TxBadge type={tx.type} /></td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${Number(tx.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {Number(tx.amount) >= 0 ? "+" : ""}{Number(tx.amount).toFixed(6)}</td>
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

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-xl p-4 border ${highlight ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"}`}>
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
