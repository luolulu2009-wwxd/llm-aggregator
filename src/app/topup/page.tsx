"use client";

import { useState } from "react";

const USDT_ADDRESS = "TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5";

export default function TopupPage() {
  const [apiKey, setApiKey] = useState("");
  const [txHash, setTxHash] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitTx() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/topup/crypto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ txHash, amount: Number(amount) }),
      });
      const data = await res.json();
      if (res.ok) setResult({ message: data.message || "提交成功，等待确认" });
      else setResult({ error: data.error?.message || "提交失败" });
    } catch {
      setResult({ error: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-lg mx-auto p-6 pt-12 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">USDT 充值</h1>
        <p className="text-zinc-500 mt-1">TRC20 网络，到账后自动加 credits</p>
      </div>

      {/* Wallet Address */}
      <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-xl p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">收款地址</p>
        <code className="block text-sm font-mono break-all bg-white dark:bg-zinc-800 rounded px-3 py-2">
          {USDT_ADDRESS}
        </code>
        <button
          onClick={() => navigator.clipboard.writeText(USDT_ADDRESS)}
          className="text-xs text-blue-600 hover:underline"
        >
          点击复制
        </button>
      </div>

      {/* Submit Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="sk-..." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">转账金额 (USDT)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="10" step="0.01" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">交易哈希 (TxID)</label>
          <input type="text" value={txHash} onChange={(e) => setTxHash(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono" placeholder="从 OKX/钱包复制 TxID" />
        </div>
        <button onClick={submitTx} disabled={loading || !apiKey || !txHash || !amount}
          className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 font-medium disabled:opacity-50">
          {loading ? "提交中..." : "提交充值"}
        </button>
      </div>

      {result?.message && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          {result.message}
        </div>
      )}
      {result?.error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          {result.error}
        </div>
      )}

      <div className="text-xs text-zinc-400 space-y-1">
        <p>1. 复制地址 → 在 OKX/钱包转账 USDT (TRC20)</p>
        <p>2. 复制交易哈希 → 填到上面提交</p>
        <p>3. 管理员确认到账后自动加 credits</p>
        <p className="text-zinc-500 mt-2">费率: 5% 平台费。10 USDT → 9.5 USDT 等值 credits</p>
      </div>
    </main>
  );
}
