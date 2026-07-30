export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — 列出提现申请（待处理 + 最近已完成）
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  // Admin check: trust L2+ or userId matches ADMIN_USER_ID env var
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { trustLevel: true, id: true },
  });
  const isAdmin =
    (process.env.ADMIN_USER_ID && user?.id === process.env.ADMIN_USER_ID) ||
    user?.trustLevel === "L3";
  if (!isAdmin) {
    return Response.json({ error: { message: "仅管理员可访问" } }, { status: 403 });
  }

  const withdrawals = await prisma.transaction.findMany({
    where: {
      type: "refund",
      description: { contains: "USDT提现" },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      amount: true,
      description: true,
      metadata: true,
      createdAt: true,
    },
  });

  // Enrich with user email
  const userIds = [...new Set(withdrawals.map(w => w.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, creditBalance: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const data = withdrawals.map(w => {
    const meta = w.metadata as Record<string, any> | null;
    const u = userMap.get(w.userId);
    return {
      id: w.id,
      userId: w.userId,
      userEmail: u?.email || "未知",
      userBalance: Number(u?.creditBalance || 0),
      amount: Number(w.amount),
      usdtAddress: meta?.usdtAddress || "未知",
      netAmount: meta?.netAmount || 0,
      network: meta?.network || "TRC20",
      status: meta?.status || "pending",
      createdAt: w.createdAt,
    };
  });

  return Response.json({
    data,
    pending: data.filter(w => w.status === "pending").length,
    total: data.length,
  });
}
