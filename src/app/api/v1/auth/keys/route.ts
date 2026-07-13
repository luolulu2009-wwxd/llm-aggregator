export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: { message: "未登录" } }, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const apiKey = await prisma.apiKey.findFirst({
      where: { userId: payload.userId as string, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!apiKey) return NextResponse.json({ error: { message: "没有 API Key" } }, { status: 404 });

    return NextResponse.json({ apiKey: `sk-***` }); // Don't return full key, just indicate it exists
  } catch {
    return NextResponse.json({ error: { message: "登录过期" } }, { status: 401 });
  }
}
