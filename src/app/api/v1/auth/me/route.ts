import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

export async function GET(req: NextRequest) {
  let userId: string | null = null;

  // Try cookie first
  const token = req.cookies.get("auth_token")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      userId = payload.userId as string;
    } catch {}
  }

  // Fallback to API key
  if (!userId) {
    const auth = await validateApiKey(req.headers.get("authorization"));
    if (auth) userId = auth.userId;
  }

  if (!userId) {
    return NextResponse.json({ error: { message: "未登录" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, creditBalance: true, trustLevel: true },
  });
  if (!user) {
    return NextResponse.json({ error: { message: "用户不存在" } }, { status: 401 });
  }
  return NextResponse.json({
    ...user,
    creditBalance: Number(user.creditBalance),
  });
}
