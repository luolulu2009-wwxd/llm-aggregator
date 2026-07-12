import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: { message: "Unauthorized", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  const { txHash, amount } = await req.json();
  if (!txHash || !amount || amount <= 0) {
    return Response.json(
      { error: { message: "txHash and positive amount required", type: "invalid_request", code: 400 } },
      { status: 400 },
    );
  }

  // Check for duplicate tx
  const existing = await prisma.transaction.findFirst({
    where: { userId: auth.userId, description: `USDT topup tx: ${txHash}` },
  });
  if (existing) {
    return Response.json(
      { error: { message: "This transaction has already been submitted", type: "duplicate", code: 409 } },
      { status: 409 },
    );
  }

  // Create pending topup record
  const fee = amount * 0.05;
  const credits = amount - fee;

  await prisma.transaction.create({
    data: {
      userId: auth.userId,
      amount: 0, // pending, not yet credited
      type: "topup",
      description: `USDT topup tx: ${txHash} (${amount} USDT → ${credits} credits, pending)`,
      balanceAfter: 0,
      metadata: { txHash, amount, credits, fee, status: "pending" },
    },
  });

  return Response.json({
    message: `充值申请已提交。${amount} USDT → ${credits} credits（扣除5%手续费 ¥${fee}）。管理员确认到账后自动发放。TxID: ${txHash}`,
  });
}
