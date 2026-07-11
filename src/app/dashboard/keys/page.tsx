"use client";

import { useState } from "react";

interface ProviderKey {
  id: string;
  provider: string;
  modelFamily: string;
  dailyLimit: number;
  todayUsed: number;
  status: string;
  contributedTokens: number;
  earnedCredits: number;
  lastHealthCheck: string;
  createdAt: string;
}

export default function KeysPage() {
  const [apiKey, setApiKey] = useState("");
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Upload form
  const [uploadProvider, setUploadProvider] = useState("deepseek");
  const [uploadModel, setUploadModel] = useState("deepseek-chat");
  const [uploadKeyValue, setUploadKeyValue] = useState("");
  const [uploadLimit, setUploadLimit] = useState(1_000_000);
  const [uploading, setUploading] = useState(false);

  async function fetchKeys(key: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/admin/keys", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || "Failed");
      const json = await res.json();
      setKeys(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadKey() {
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          provider: uploadProvider,
          modelFamily: uploadModel,
          keyValue: uploadKeyValue,
          dailyLimit: uploadLimit,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || "Upload failed");
      setUploadKeyValue("");
      await fetchKeys(apiKey);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const totalEarned = keys.reduce((sum, k) => sum + Number(k.earnedCredits), 0);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Key 管理</h1>
        <p className="text-zinc-500">贡献你的 API Key，赚取 credits</p>
      </header>

      {/* API Key Input */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-3">
        <label className="block text-sm font-medium">你的 API Key</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 rounded-lg border px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={() => fetchKeys(apiKey)}
            disabled={loading || !apiKey}
            className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Loading..." : "查询"}
          </button>
        </div>
      </div>

      {/* Upload Form */}
      {keys.length > 0 || true ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">上传新 Key</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Provider</label>
              <select value={uploadProvider} onChange={(e) => setUploadProvider(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="qwen">Qwen (通义千问)</option>
                <option value="glm">GLM (智谱)</option>
                <option value="moonshot">Moonshot</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Model Family</label>
              <input type="text" value={uploadModel} onChange={(e) => setUploadModel(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">API Key Value</label>
              <input type="password" value={uploadKeyValue} onChange={(e) => setUploadKeyValue(e.target.value)}
                placeholder="sk-..." className="w-full rounded-lg border px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">日限额 (tokens)</label>
              <input type="number" value={uploadLimit} onChange={(e) => setUploadLimit(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={uploadKey} disabled={uploading || !uploadKeyValue}
                className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
                {uploading ? "上传中..." : "上传 Key"}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
      ) : null}

      {/* Key List */}
      {keys.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="贡献 Key 数" value={`${keys.length}`} />
            <StatCard label="累计贡献 Tokens" value={`${(keys.reduce((s, k) => s + Number(k.contributedTokens), 0) / 1_000_000).toFixed(1)}M`} />
            <StatCard label="累计赚取 Credits" value={`¥${totalEarned.toFixed(4)}`} />
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">我的 Key</h2>
            <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-2">Provider</th>
                    <th className="text-left px-4 py-2">Model</th>
                    <th className="text-right px-4 py-2">今日/限额</th>
                    <th className="text-left px-4 py-2">状态</th>
                    <th className="text-right px-4 py-2">贡献</th>
                    <th className="text-right px-4 py-2">收益</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{k.provider}</td>
                      <td className="px-4 py-2 text-zinc-500">{k.modelFamily}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {(k.todayUsed / 1000).toFixed(0)}K / {(k.dailyLimit / 1000).toFixed(0)}K
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={k.status} />
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {(Number(k.contributedTokens) / 1000).toFixed(0)}K
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-green-600">
                        ¥{Number(k.earnedCredits).toFixed(4)}
                      </td>
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
    <div className="bg-white dark:bg-zinc-900 border rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    paused: "bg-zinc-100 text-zinc-600",
    banned: "bg-red-100 text-red-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] || ""}`}>{status}</span>;
}
