export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/v1/account/balance — check balance
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { creditBalance: true, trustLevel: true },
  });

  if (!user) {
    return Response.json({ error: { message: "User not found", type: "not_found", code: 404 } }, { status: 404 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayUsage, transactions] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { userId: auth.userId, createdAt: { gte: todayStart } },
      _sum: { promptTokens: true, completionTokens: true, cost: true },
    }),
    prisma.transaction.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amount: true, type: true, description: true, balanceAfter: true, createdAt: true },
    }),
  ]);

  return Response.json({
    balance: Number(user.creditBalance),
    trustLevel: user.trustLevel,
    todayUsage: {
      promptTokens: todayUsage._sum.promptTokens || 0,
      completionTokens: todayUsage._sum.completionTokens || 0,
      cost: Number(todayUsage._sum.cost || 0),
    },
    transactions,
  });
}

// POST /api/v1/account/topup — add credits (admin/internal use for V1)
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json({ error: { message: "Unauthorized", type: "authentication_error", code: 401 } }, { status: 401 });
  }

  const { amount } = await req.json();
  if (!amount || amount <= 0) {
    return Response.json({ error: { message: "amount must be positive", type: "invalid_request_error", code: 400 } }, { status: 400 });
  }

  // 5% platform fee
  const fee = amount * 0.05;
  const creditAmount = amount - fee;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: auth.userId },
      data: { creditBalance: { increment: creditAmount } },
    });

    await tx.transaction.create({
      data: {
        userId: auth.userId,
        amount: creditAmount,
        type: "topup",
        description: `Top-up ¥${amount} (fee ¥${fee})`,
        balanceAfter: user.creditBalance,
      },
    });

    return user;
  });

  return Response.json({
    balance: Number(result.creditBalance),
    credited: creditAmount,
    fee,
  });
}
