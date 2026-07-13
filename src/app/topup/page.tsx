"use client";

import { useState, useEffect } from "react";

const CRYPTO_ADDRESSES: Record<string, { address: string; network: string }> = {
  USDT: { address: "TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5", network: "TRC20" },
  BTC: { address: "bc1q..." /* placeholder - needs real address */, network: "Bitcoin" },
  ETH: { address: "0x..." /* placeholder - needs real address */, network: "ERC20" },
};

const FIAT_METHODS = [
  { id: "alipay", name: "支付宝", icon: "支", countries: ["中国"], rate: "¥1 = ¥1 credits", available: false },
  { id: "wechat", name: "微信支付", icon: "微", countries: ["中国"], rate: "¥1 = ¥1 credits", available: false },
  { id: "stripe", name: "Visa/Mastercard", icon: "💳", countries: ["全球"], rate: "$1 = $1 credits", available: true },
  { id: "paypal", name: "PayPal", icon: "P", countries: ["全球"], rate: "$1 = $1 credits", available: false },
];

export default function TopupPage() {
  const [method, setMethod] = useState<"crypto" | "fiat">("crypto");
  const [coin, setCoin] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/v1/auth/me").then(r => r.json()).then(d => { if (d.email) setUser(d); });
  }, []);

  async function submitCrypto() {
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/v1/topup/crypto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: "manual-" + Date.now(), amount: Number(amount), coin }),
      });
      const d = await res.json();
      setResult(res.ok ? { message: d.message } : { error: d.error?.message });
    } catch { setResult({ error: "网络错误" }); }
    setLoading(false);
  }

  const addr = CRYPTO_ADDRESSES[coin];
  const creditAmount = amount ? (Number(amount) * 0.95).toFixed(2) : "0";

  return (
    <main className="max-w-lg mx-auto p-6 pt-12 space-y-6">
      <h1 className="text-2xl font-bold">充值</h1>

      {/* Method tabs */}
      <div className="flex gap-2">
        {(["crypto", "fiat"] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"
            }`}>
            {m === "crypto" ? "💰 加密货币" : "💳 法币/卡"}
          </button>
        ))}
      </div>

      {/* Crypto */}
      {method === "crypto" && (
        <div className="space-y-4">
          <div className="flex gap-1">
            {Object.keys(CRYPTO_ADDRESSES).map(c => (
              <button key={c} onClick={() => setCoin(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  coin === c ? "bg-zinc-900 text-white" : "bg-zinc-100 dark:bg-zinc-800"
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-xl p-4 text-center space-y-2">
            <p className="text-xs text-zinc-500">收款地址 ({addr.network})</p>
            <code className="block text-xs font-mono break-all bg-white dark:bg-zinc-800 rounded px-3 py-2">
              {addr.address}
            </code>
            <button onClick={() => navigator.clipboard.writeText(addr.address)}
              className="text-xs text-blue-600 hover:underline">复制地址</button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">转账金额 ({coin})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2" placeholder="10" step="0.01" />
            <p className="text-xs text-zinc-400 mt-1">
              到账: {creditAmount} credits（5% 平台费）| 最低 ¥1/USDT
            </p>
          </div>

          <button onClick={submitCrypto} disabled={loading || !amount}
            className="w-full rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 font-medium disabled:opacity-50">
            {loading ? "提交中..." : `充值 ${creditAmount} credits`}
          </button>

          <div className="text-xs text-zinc-400 space-y-1 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3">
            <p>1. 复制地址 → 在钱包转账</p>
            <p>2. 提交后管理员确认到账</p>
            <p>3. 大额请联系 Telegram/Email 加速</p>
          </div>
        </div>
      )}

      {/* Fiat */}
      {method === "fiat" && (
        <div className="space-y-4">
          {FIAT_METHODS.map(m => (
            <div key={m.id} className={`border rounded-xl p-4 flex items-center gap-3 ${m.available ? "cursor-pointer hover:border-zinc-400" : "opacity-50"}`}>
              <span className="text-2xl w-10 text-center">{m.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{m.name}</span>
                  <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{m.countries.join(" · ")}</span>
                </div>
                <p className="text-xs text-zinc-500">{m.rate}</p>
              </div>
              {m.available
                ? <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">可用</span>
                : <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded">即将上线</span>
              }
            </div>
          ))}

          <div className="text-center text-xs text-zinc-400 pt-2">
            支付宝/微信/PayPal 即将上线 · 大额充值请联系管理员
          </div>
        </div>
      )}

      {result?.message && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">{result.message}</div>}
      {result?.error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{result.error}</div>}
    </main>
  );
}
