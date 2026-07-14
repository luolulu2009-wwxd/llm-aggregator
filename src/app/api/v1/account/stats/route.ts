export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000");

async function getUserId(req: NextRequest): Promise<string | null> {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (auth) return auth.userId;
  const token = req.cookies.get("auth_token")?.value;
  if (token) { try { const r = await jwtVerify(token, JWT_SECRET); return r.payload.userId as string; } catch {} }
  return null;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: { message: "请先登录" } }, { status: 401 });

  // Get 7-day usage trend
  const days: { date: string; tokens: number; cost: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start.getTime() + 86400000);
    const usage = await prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: start, lt: end }, status: "success" },
      _sum: { promptTokens: true, completionTokens: true, cost: true },
    });
    days.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      tokens: (usage._sum.promptTokens || 0) + (usage._sum.completionTokens || 0),
      cost: Number(usage._sum.cost || 0),
    });
  }

  // Model distribution
  const modelUsage = await prisma.usageLog.groupBy({
    by: ["modelSlug"],
    where: { userId, status: "success" },
    _sum: { cost: true, promptTokens: true, completionTokens: true },
    orderBy: { _sum: { cost: "desc" } },
    take: 10,
  });

  // Contribution earnings
  const contributionEarnings = await prisma.transaction.aggregate({
    where: { userId, type: "contribution" },
    _sum: { amount: true },
  });

  const totalEarned = Number(contributionEarnings._sum.amount || 0);

  return NextResponse.json({
    days,
    models: modelUsage.map((m: any) => ({
      slug: m.modelSlug,
      cost: Number(m._sum.cost || 0),
      tokens: (m._sum.promptTokens || 0) + (m._sum.completionTokens || 0),
    })),
    totalEarned,
  });
}
