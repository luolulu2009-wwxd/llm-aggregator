"use client";
import { useState, useEffect } from "react";

const COINS = [
  { id: "USDT", name: "USDT (TRC20)", fee: "2%", min: 10 },
  { id: "BTC", name: "Bitcoin", fee: "2%", min: 50, available: false },
  { id: "ETH", name: "Ethereum (ERC20)", fee: "2%", min: 50, available: false },
  { id: "ALIPAY", name: "支付宝 (人民币)", fee: "0%", min: 100, available: false },
  { id: "PAYPAL", name: "PayPal (USD)", fee: "3%", min: 20, available: false },
];

export default function WithdrawPage() {
  const [coin, setCoin] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => { fetch("/api/v1/auth/me").then(r => r.json()).then(d => { if (d.email) setUser(d); }); }, []);

  async function handleWithdraw() {
    setLoading(true); setResult(null);
    try {
      const c = COINS.find(c => c.id === coin)!;
      const res = await fetch("/api/v1/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), usdtAddress: address, network: coin, coin }),
      });
      const d = await res.json();
      setResult(res.ok ? { message: d.message } : { error: d.error?.message || "提现失败" });
    } catch { setResult({ error: "网络错误" }); }
    setLoading(false);
  }

  const selected = COINS.find(c => c.id === coin)!;
  const netAmount = amount ? (Number(amount) * (1 - (selected.fee === "2%" ? 0.02 : selected.fee === "3%" ? 0.03 : 0))).toFixed(2) : "0";

  if (!user) return <main className="max-w-md mx-auto p-6 pt-20 text-center">请先 <a href="/login" className="text-blue-600">登录</a></main>;

  return (
    <main className="max-w-md mx-auto p-6 pt-12 space-y-6">
      <h1 className="text-2xl font-bold">提现</h1>

      <div className="flex flex-wrap gap-1">
        {COINS.map(c => (
          <button key={c.id} onClick={() => setCoin(c.id)}
            disabled={c.available === false}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              coin === c.id ? "bg-zinc-900 text-white" : "bg-zinc-100 dark:bg-zinc-800"
            } disabled:opacity-40`}>
            {c.name} {c.available === false && "🔜"}
          </button>
        ))}
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 text-xs space-y-1">
        <p>手续费: {selected.fee} · 最低提现: ¥{selected.min}</p>
        <p>到账: {netAmount} {selected.id} · 24h 内到账</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">金额</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2" placeholder={String(selected.min)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">收款地址</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm" placeholder={selected.id === "ALIPAY" ? "支付宝账号" : "钱包地址"} />
        </div>
        <button onClick={handleWithdraw} disabled={loading || !amount || !address}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 font-medium disabled:opacity-50">
          {loading ? "提交中..." : `提现 ${netAmount} ${selected.id}`}
        </button>
      </div>

      {result?.message && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">{result.message}</div>}
      {result?.error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{result.error}</div>}
    </main>
  );
}
