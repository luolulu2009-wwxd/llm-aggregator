import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_DECIMALS = 6;
const RECEIVE_ADDRESS = process.env.USDT_ADDRESS || "";

interface TronTx {
  txID: string;
  ret?: Array<{ contractRet: string }>;
  raw_data?: {
    contract?: Array<{
      parameter?: { value?: { data?: string; amount?: number; owner_address?: string; to_address?: string; contract_address?: string } };
    }>;
  };
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } }, { status: 401 });
  }

  const { txHash } = await req.json();
  if (!txHash) {
    return Response.json({ error: { message: "txHash required" } }, { status: 400 });
  }

  // Duplicate check
  const existing = await prisma.transaction.findFirst({
    where: { description: { contains: txHash } },
  });
  if (existing) {
    return Response.json({ error: { message: "This transaction has already been submitted" } }, { status: 409 });
  }

  // Verify on-chain via TronGrid
  let verified = false;
  let amount = 0;

  try {
    const res = await fetch(`https://api.trongrid.io/v1/transactions/${txHash}`);
    if (!res.ok) {
      return Response.json({ error: { message: `Transaction not found (${res.status})` } }, { status: 404 });
    }

    const tx = await res.json() as TronTx;

    // Check success
    if (tx.ret?.[0]?.contractRet !== "SUCCESS") {
      return Response.json({ error: { message: "Transaction failed on-chain" } }, { status: 400 });
    }

    // Parse TRC20 transfer
    const contract = tx.raw_data?.contract?.[0];
    const param = contract?.parameter?.value;
    const contractAddr = param?.contract_address;
    const toAddr = param?.to_address;
    const rawAmount = param?.amount;
    const data = param?.data;

    if (contractAddr && toAddr && typeof rawAmount === "number") {
      // Direct TRC20 transfer
      if (contractAddr.toUpperCase() !== USDT_CONTRACT.toUpperCase()) {
        return Response.json({ error: { message: "Not a USDT transaction" } }, { status: 400 });
      }
      if (toAddr.toUpperCase() !== RECEIVE_ADDRESS.toUpperCase()) {
        return Response.json({ error: { message: `Sent to wrong address: ${toAddr}` } }, { status: 400 });
      }
      amount = rawAmount / Math.pow(10, USDT_DECIMALS);
      verified = true;
    } else if (data) {
      // TRC20 transfer via data field (hex encoded)
      const hex = data.replace(/^0x/, "");
      if (hex.length >= 136) {
        const toHex = "41" + hex.slice(32, 72); // Tron address prefix + 20 bytes
        const amountHex = hex.slice(72, 136);
        const amt = parseInt(amountHex, 16);
        if (!isNaN(amt) && contractAddr?.toUpperCase() === USDT_CONTRACT.toUpperCase()) {
          const addr = hexToBase58(toHex);
          if (addr.toUpperCase() === RECEIVE_ADDRESS.toUpperCase()) {
            amount = amt / Math.pow(10, USDT_DECIMALS);
            verified = true;
          }
        }
      }
    }

    if (!verified) {
      return Response.json({ error: { message: "Could not parse USDT transfer from this transaction" } }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: { message: "Failed to verify transaction on-chain" } }, { status: 502 });
  }

  if (amount <= 0) {
    return Response.json({ error: { message: "Zero amount transaction" } }, { status: 400 });
  }

  // Credit user
  const fee = amount * 0.03; // 3% fee
  const credits = amount - fee;

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { creditBalance: { increment: credits } },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId: auth.userId,
      amount: credits,
      type: "topup",
      description: `USDT deposit: ${amount} USDT → ¥${credits.toFixed(4)} (fee: ${fee.toFixed(4)}) | tx: ${txHash}`,
      balanceAfter: Number(user.creditBalance),
      metadata: { txHash, amount, credits, fee, currency: "USDT-TRC20", status: "verified" },
    },
  });

  return Response.json({
    message: `充值成功！${amount} USDT → ¥${credits.toFixed(4)} credits（3%手续费）`,
    amount,
    credits: Number(credits.toFixed(4)),
    balance: Number(user.creditBalance),
    txId: tx.id,
  });
}

// Tron hex address to Base58
function hexToBase58(hex: string): string {
  const bs58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = Buffer.from(hex, "hex");
  let leadingZeros = 0;
  for (const b of bytes) { if (b === 0) leadingZeros++; else break; }
  const digits = [0];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  return "1".repeat(leadingZeros) + digits.reverse().map(d => bs58[d]).join("");
}
