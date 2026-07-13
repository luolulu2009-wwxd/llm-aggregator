"use client";
import { useState, useEffect } from "react";

export default function WithdrawPage() {
  const [amount, setAmount] = useState("");
  const [usdtAddress, setUsdtAddress] = useState("");
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => { fetch("/api/v1/auth/me").then(r => r.json()).then(d => { if (d.email) setUser(d); }); }, []);

  async function handleWithdraw() {
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/v1/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), usdtAddress, network: "TRC20" }),
      });
      const d = await res.json();
      setResult(res.ok ? { message: d.message } : { error: d.error?.message || "提现失败" });
    } catch { setResult({ error: "网络错误" }); }
    setLoading(false);
  }

  if (!user) return <main className="max-w-md mx-auto p-6 pt-20 text-center">请先 <a href="/login" className="text-blue-600">登录</a></main>;

  return (
    <main className="max-w-md mx-auto p-6 pt-12 space-y-6">
      <h1 className="text-2xl font-bold">USDT 提现</h1>
      <div className="bg-zinc-50 border rounded-xl p-4 text-sm space-y-1">
        <p>贡献收益可提现为 USDT</p>
        <p className="text-zinc-500">手续费 2% | TRC20 网络 | 24小时内到账</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">提现金额 (USDT)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder="10" step="0.01" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">USDT 收款地址 (TRC20)</label>
          <input type="text" value={usdtAddress} onChange={e => setUsdtAddress(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm" placeholder="T..." />
        </div>
        <button onClick={handleWithdraw} disabled={loading || !amount || !usdtAddress}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 font-medium disabled:opacity-50">
          {loading ? "提交中..." : "提交提现申请"}
        </button>
      </div>
      {result?.message && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">{result.message}</div>}
      {result?.error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{result.error}</div>}
    </main>
  );
}
