export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

async function getUserId(req: NextRequest): Promise<string | null> {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (auth) return auth.userId;
  const token = req.cookies.get("auth_token")?.value;
  if (token) { try { const { payload } = await jwtVerify(token, JWT_SECRET); return payload.userId as string; } catch {} }
  return null;
}

// POST — 审批提现（通过/拒绝）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(req);
  if (!userId) {
    return Response.json({ error: { message: "请先登录" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustLevel: true, id: true },
  });
  const isAdmin =
    (process.env.ADMIN_USER_ID && user?.id === process.env.ADMIN_USER_ID) ||
    user?.trustLevel === "L3";
  if (!isAdmin) {
    return Response.json({ error: { message: "仅管理员可操作" } }, { status: 403 });
  }

  const { id } = await params;
  const { action, txHash } = await req.json().catch(() => ({}));

  if (!action || !["approve", "reject"].includes(action)) {
    return Response.json({ error: { message: "action 必须是 approve 或 reject" } }, { status: 400 });
  }

  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || tx.type !== "refund") {
    return Response.json({ error: { message: "提现记录不存在" } }, { status: 404 });
  }

  const meta = (tx.metadata as Record<string, any>) || {};
  if (meta.status !== "pending") {
    return Response.json({ error: { message: `该申请已${meta.status === "approved" ? "通过" : "拒绝"}` } }, { status: 409 });
  }

  if (action === "approve") {
    // Mark as approved + record on-chain txHash if provided
    const newMeta = { ...meta, status: "approved", approvedBy: auth.userId, approvedAt: new Date().toISOString(), txHash: txHash || null };
    await prisma.transaction.update({
      where: { id },
      data: {
        description: tx.description?.replace("USDT提现申请", "USDT提现已打款"),
        metadata: newMeta,
      },
    });

    return Response.json({
      message: "提现已标记为已打款。请确认已手动转账。",
      reminder: meta.netAmount
        ? `需向 ${meta.usdtAddress} 转账 ${meta.netAmount} USDT（${meta.network || "TRC20"}）`
        : "请确认已手动打款",
    });
  }

  // Reject — refund the deducted credits
  if (action === "reject") {
    const refundAmount = Math.abs(Number(tx.amount));
    const newMeta = { ...meta, status: "rejected", rejectedBy: auth.userId, rejectedAt: new Date().toISOString() };

    await prisma.$transaction([
      prisma.user.update({
        where: { id: tx.userId },
        data: { creditBalance: { increment: refundAmount } },
      }),
      prisma.transaction.update({
        where: { id },
        data: {
          description: (tx.description || "").replace("USDT提现申请", "USDT提现已拒绝（已退款）"),
          metadata: newMeta,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: tx.userId,
          amount: refundAmount,
          type: "topup",
          description: `提现拒绝退款: ¥${refundAmount.toFixed(4)}`,
          balanceAfter: 0,
          metadata: { reason: "withdrawal_rejected", originalTxId: id },
        },
      }),
    ]);

    return Response.json({ message: `已拒绝并退款 ¥${refundAmount.toFixed(4)} 给用户` });
  }
}
