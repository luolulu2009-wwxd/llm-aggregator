export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

async function getUserId(req: NextRequest): Promise<string | null> {
  // Try API key first
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (auth) return auth.userId;

  // Try cookie auth
  const token = req.cookies.get("auth_token")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return payload.userId as string;
    } catch {}
  }
  return null;
}

// GET /api/v1/account — check balance and usage
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: { message: "请先登录或提供 API Key", type: "authentication_error", code: 401 } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true, trustLevel: true },
  });

  if (!user) {
    return Response.json({ error: { message: "用户不存在", type: "not_found", code: 404 } }, { status: 404 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayUsage, transactions] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: todayStart } },
      _sum: { promptTokens: true, completionTokens: true, cost: true },
    }),
    prisma.transaction.findMany({
      where: { userId },
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
    insurancePool: await prisma.insurancePool.findFirst({ orderBy: { updatedAt: "desc" } }).then(p => p ? Number(p.balance) : 0),
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
