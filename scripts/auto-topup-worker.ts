/**
 * Auto-Topup Worker — polls TronGrid for incoming USDT transfers.
 *
 * Every 60s: fetches recent TRC20 transfers to the aggregator address,
 * matches sender → bound user → auto-credits.
 *
 * Run via pm2: npx tsx scripts/auto-topup-worker.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const RECEIVE_ADDRESS = process.env.USDT_ADDRESS || "TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5"; // base58 — case-sensitive!
const USDT_DECIMALS = 6;
const POLL_INTERVAL = 60_000; // 1 minute
const TRONGRID_API = "https://api.trongrid.io";

// Track processed txIDs to avoid double-crediting
const processedTxs = new Set<string>();

interface TronTransfer {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
}

async function poll() {
  try {
    // Fetch recent USDT transfers to our address (last 200 blocks ≈ ~10 min)
    const url = `${TRONGRID_API}/v1/accounts/${RECEIVE_ADDRESS}/transactions/trc20?contract_address=${USDT_CONTRACT}&only_to=true&limit=50`;
    const res = await fetch(url, {
      headers: { "User-Agent": "llm-aggregator/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.log(`[auto-topup] TronGrid ${res.status}, retry next cycle`);
      return;
    }

    const data = await res.json() as { data: TronTransfer[] };
    if (!data.data || data.data.length === 0) {
      // Normal: no new transactions since last poll
      return;
    }
    console.log(`[auto-topup] Found ${data.data.length} new transfer(s)`);

    for (const tx of data.data) {
      const txId = tx.transaction_id;

      // Skip already processed
      if (processedTxs.has(txId)) continue;
      processedTxs.add(txId);

      // Keep Set bounded
      if (processedTxs.size > 10000) {
        const iter = processedTxs.values();
        for (let i = 0; i < 100; i++) processedTxs.delete(iter.next().value!);
      }

      // Skip if already recorded in DB
      const existing = await prisma.transaction.findFirst({
        where: { description: { contains: txId } },
      });
      if (existing) continue;

      const sender = tx.from.toUpperCase();
      const rawAmount = BigInt(tx.value || "0");
      const amount = Number(rawAmount) / Math.pow(10, USDT_DECIMALS);
      if (amount <= 0) continue;

      // Match sender to user
      const user = await prisma.user.findFirst({
        where: { tronAddress: sender },
        select: { id: true, email: true, creditBalance: true },
      });
      if (!user) continue; // unregistered sender, skip

      // Credit user
      const fee = amount * 0.03;
      const credits = amount - fee;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: { increment: credits } },
        select: { creditBalance: true },
      });

      await prisma.transaction.create({
        data: {
          userId: user.id,
          amount: credits,
          type: "topup",
          description: `USDT auto-deposit: ${amount} USDT → ¥${credits.toFixed(4)} (3% fee) | tx: ${txId}`,
          balanceAfter: Number(updated.creditBalance),
          metadata: { txHash: txId, amount, credits, fee, sender, currency: "USDT-TRC20", status: "auto-verified" },
        },
      });

      console.log(`[auto-topup] ✅ ${user.email}: +¥${credits.toFixed(4)} (${amount} USDT from ${sender.slice(0,8)}...)`);
    }
  } catch (err) {
    console.error("[auto-topup] Poll error:", err instanceof Error ? err.message : err);
  }
}

// Boot — only run when executed directly (not when imported as module)
const isMain = process.argv[1]?.includes("auto-topup-worker");
if (isMain) {
  console.log(`[auto-topup] 🤖 Starting... watching ${RECEIVE_ADDRESS}`);
  console.log(`[auto-topup] Any USDT transfer → bound user → auto-credit (3% fee)`);
  poll();
  setInterval(poll, POLL_INTERVAL);
  console.log("[auto-topup] ✅ Worker running (poll every 60s)");
}
