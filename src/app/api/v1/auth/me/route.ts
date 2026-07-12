import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ error: { message: "未登录" } }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: { id: true, email: true, name: true, creditBalance: true, trustLevel: true },
    });
    if (!user) {
      return NextResponse.json({ error: { message: "用户不存在" } }, { status: 401 });
    }
    return NextResponse.json({
      ...user,
      creditBalance: Number(user.creditBalance),
    });
  } catch {
    return NextResponse.json({ error: { message: "登录过期" } }, { status: 401 });
  }
}
