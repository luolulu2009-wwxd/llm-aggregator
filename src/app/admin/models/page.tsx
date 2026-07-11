"use client";

import { useEffect, useState } from "react";

interface ModelInfo {
  slug: string;
  provider: string;
  name: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: string;
  status: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/models/all")
      .then((r) => r.json())
      .then((d) => { setModels(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">模型管理</h1>
      <div className="bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="text-left px-4 py-2">名称</th>
              <th className="text-left px-4 py-2">Provider</th>
              <th className="text-right px-4 py-2">输入价/1M</th>
              <th className="text-right px-4 py-2">输出价/1M</th>
              <th className="text-right px-4 py-2">上下文</th>
              <th className="text-left px-4 py-2">能力</th>
              <th className="text-left px-4 py-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-zinc-400">加载中...</td></tr>
            ) : models.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-zinc-400">暂无模型数据</td></tr>
            ) : (
              models.map((m) => (
                <tr key={m.slug} className="border-t">
                  <td className="px-4 py-2 font-medium">{m.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{m.provider}</td>
                  <td className="px-4 py-2 text-right font-mono">¥{m.inputPrice.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right font-mono">¥{m.outputPrice.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right font-mono">{(m.contextWindow / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-2 text-zinc-500">{m.capabilities}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      m.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>{m.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
