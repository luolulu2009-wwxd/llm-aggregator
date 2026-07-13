export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000");

async function getUserId(req: NextRequest): Promise<string | null> {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (auth) return auth.userId;
  const t = req.cookies.get("auth_token")?.value;
  if (t) { try { const r = await jwtVerify(t, JWT_SECRET); return r.payload.userId as string; } catch {} }
  return null;
}

// POST — request withdrawal
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: { message: "请先登录" } }, { status: 401 });

  const { amount, usdtAddress, network } = await req.json();
  if (!amount || amount <= 0 || !usdtAddress) {
    return Response.json({ error: { message: "金额和USDT地址为必填项" } }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  if (!user || Number(user.creditBalance) < amount) {
    return Response.json({ error: { message: "余额不足" } }, { status: 402 });
  }

  // Deduct balance and create withdrawal record
  const fee = amount * 0.02; // 2% withdrawal fee
  const netAmount = amount - fee;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: amount } } });
    await tx.transaction.create({
      data: {
        userId, amount: -amount, type: "refund",
        description: `USDT提现申请: ${netAmount} USDT → ${usdtAddress} (${network || "TRC20"}, 手续费 ¥${fee})`,
        balanceAfter: 0,
        metadata: { usdtAddress, network: network || "TRC20", netAmount, fee, status: "pending" },
      },
    });
  });

  return Response.json({ message: `提现申请已提交。${netAmount} USDT 将发送至 ${usdtAddress}，2%手续费。预计24小时内到账。` }, { status: 201 });
}

// GET — list withdrawal requests
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: { message: "请先登录" } }, { status: 401 });

  const txs = await prisma.transaction.findMany({
    where: { userId, type: "refund" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return Response.json({ data: txs });
}
