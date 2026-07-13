"use client";

import { useState, useEffect } from "react";

interface ProviderKey {
  id: string; provider: string; modelFamily: string;
  dailyLimit: number; todayUsed: number; status: string;
  contributedTokens: number; earnedCredits: number;
  lastHealthCheck: string; createdAt: string;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  // Upload form
  const [uploadProvider, setUploadProvider] = useState("deepseek");
  const [uploadModel, setUploadModel] = useState("");
  const [uploadKeyValue, setUploadKeyValue] = useState("");
  const [uploadLimit, setUploadLimit] = useState(1_000_000);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    // Check if logged in
    fetch("/api/v1/auth/me").then(r => r.json()).then(d => {
      if (d.email) { setLoggedIn(true); loadKeys(); }
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadKeys() {
    try {
      const res = await fetch("/api/v1/admin/keys");
      if (res.ok) setKeys((await res.json()).data || []);
    } catch { setError("加载失败"); }
    setLoading(false);
  }

  async function uploadKey() {
    setUploading(true); setResult(""); setError("");
    try {
      const res = await fetch("/api/v1/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: uploadProvider,
          modelFamily: uploadModel || `${uploadProvider}-default`,
          keyValue: uploadKeyValue,
          dailyLimit: uploadLimit,
        }),
      });
      const d = await res.json();
      if (res.ok) { setResult("上传成功！"); setUploadKeyValue(""); loadKeys(); }
      else setError(d.error?.message || "上传失败");
    } catch { setError("网络错误"); }
    setUploading(false);
  }

  const totalEarned = keys.reduce((s, k) => s + Number(k.earnedCredits), 0);
  const totalContributed = keys.reduce((s, k) => s + Number(k.contributedTokens), 0);

  if (loading) return <main className="max-w-4xl mx-auto p-6">加载中...</main>;
  if (!loggedIn) return <main className="max-w-4xl mx-auto p-6">请先 <a href="/login" className="text-blue-600">登录</a></main>;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Key 管理</h1>

      {/* Contribution stats */}
      {keys.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="贡献 Key 数" value={`${keys.length}`} />
          <StatCard label="累计贡献 Tokens" value={`${(totalContributed / 1_000_000).toFixed(1)}M`} />
          <StatCard label="累计赚取 Credits" value={`¥${totalEarned.toFixed(4)}`} />
        </div>
      )}

      {/* Upload form */}
      <div className="bg-white dark:bg-zinc-900 border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">上传新 Key（赚取 ×1.2 credits 奖励）</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Provider</label>
            <select value={uploadProvider} onChange={e => setUploadProvider(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="qwen">Qwen (通义千问)</option>
              <option value="glm">GLM (智谱)</option>
              <option value="moonshot">Moonshot</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Model Family</label>
            <input type="text" value={uploadModel} onChange={e => setUploadModel(e.target.value)}
              placeholder="deepseek-chat" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-zinc-500 mb-1">API Key 值</label>
            <input type="password" value={uploadKeyValue} onChange={e => setUploadKeyValue(e.target.value)}
              placeholder="sk-..." className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">日限额 (tokens)</label>
            <input type="number" value={uploadLimit} onChange={e => setUploadLimit(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={uploadKey} disabled={uploading || !uploadKeyValue}
              className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
              {uploading ? "上传中..." : "上传 Key"}
            </button>
          </div>
        </div>
        {result && <p className="text-green-600 text-sm">{result}</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      {/* Key list */}
      {keys.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="text-left px-4 py-2">Provider</th>
                <th className="text-left px-4 py-2">Model</th>
                <th className="text-right px-4 py-2">今日用量</th>
                <th className="text-left px-4 py-2">状态</th>
                <th className="text-right px-4 py-2">累计贡献</th>
                <th className="text-right px-4 py-2">赚取 Credits</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{k.provider}</td>
                  <td className="px-4 py-2 text-zinc-500">{k.modelFamily}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {(k.todayUsed / 1000).toFixed(0)}K / {(k.dailyLimit / 1000).toFixed(0)}K
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={k.status} /></td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{(Number(k.contributedTokens) / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-green-600">¥{Number(k.earnedCredits).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="bg-white dark:bg-zinc-900 border rounded-xl p-4">
    <p className="text-xs text-zinc-500 mb-1">{label}</p>
    <p className="text-xl font-bold font-mono">{value}</p>
  </div>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700", pending: "bg-yellow-100 text-yellow-700",
    paused: "bg-zinc-100 text-zinc-600", banned: "bg-red-100 text-red-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] || ""}`}>{status}</span>;
}
