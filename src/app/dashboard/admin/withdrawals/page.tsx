"use client";

import { useState, useEffect } from "react";

interface Withdrawal {
  id: string;
  userId: string;
  userEmail: string;
  userBalance: number;
  amount: number;
  usdtAddress: string;
  netAmount: number;
  network: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export default function WithdrawalsAdmin() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { fetchWithdrawals(); }, []);

  async function fetchWithdrawals() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/withdrawals", {
        headers: { Authorization: `Bearer ${localStorage.getItem("api_key") || ""}` },
      });
      if (!res.ok) { setError(await res.text()); return; }
      const json = await res.json();
      setWithdrawals(json.data);
      setPending(json.pending);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    const txHash = action === "approve" ? prompt("转账 TxHash（可选，留空跳过）:") : null;
    const res = await fetch(`/api/v1/admin/withdrawals/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("api_key") || ""}` },
      body: JSON.stringify({ action, txHash: txHash || undefined }),
    });
    const data = await res.json();
    if (res.ok) alert(data.message || "操作成功");
    else alert(data.error?.message || "操作失败");
    fetchWithdrawals();
  }

  const pendingItems = withdrawals.filter(w => w.status === "pending");
  const completedItems = withdrawals.filter(w => w.status !== "pending");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">提现审核</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {pending > 0
              ? `⚠️ ${pending} 笔待处理提现`
              : "无待处理提现 ✅"}
          </p>
        </div>
        <button onClick={fetchWithdrawals} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-zinc-50 dark:hover:bg-zinc-800">
          🔄 刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-400">
          {error}
          <p className="text-xs mt-1">提示: 在 Dashboard 页面设置 API Key 后自动读取</p>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500">加载中...</p>
      ) : (
        <>
          {/* 待处理 */}
          {pendingItems.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 text-amber-600">待处理 ({pendingItems.length})</h2>
              <div className="space-y-3">
                {pendingItems.map(w => (
                  <div key={w.id} className="border border-amber-200 dark:border-amber-800 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-900/10">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <p className="font-medium text-sm">{w.userEmail}</p>
                        <p className="text-xs text-zinc-500 break-all">
                          提现: <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{w.netAmount} USDT</span>
                          {" "}({w.network}) → <span className="font-mono text-xs break-all">{w.usdtAddress}</span>
                        </p>
                        <p className="text-xs text-zinc-400">
                          原始金额 ¥{Math.abs(w.amount).toFixed(2)} · 手续费 2% · 用户余额 ¥{w.userBalance.toFixed(2)} · {formatTime(w.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleAction(w.id, "reject")}
                          className="px-3 py-1.5 text-xs rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          ✕ 拒绝
                        </button>
                        <button
                          onClick={() => handleAction(w.id, "approve")}
                          className="px-3 py-1.5 text-xs rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-80"
                        >
                          ✓ 已打款
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 已完成 */}
          {completedItems.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 text-zinc-400">历史记录</h2>
              <div className="space-y-2">
                {completedItems.slice(0, 20).map(w => (
                  <div key={w.id} className="border rounded-lg p-3 text-sm flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-medium">{w.userEmail}</span>
                      {" "}
                      <span className="text-zinc-500">{w.netAmount} USDT → {w.usdtAddress.slice(0, 8)}...</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${w.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {w.status === "approved" ? "已打款" : "已拒绝"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {withdrawals.length === 0 && (
            <p className="text-zinc-400 text-sm py-8 text-center">暂无提现记录</p>
          )}
        </>
      )}
    </div>
  );
}

function formatTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
