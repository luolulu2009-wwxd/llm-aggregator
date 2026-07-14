export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return null;
  try { const r = await jwtVerify(token, JWT_SECRET); return r.payload.userId as string; } catch { return null; }
}

// GET — list keys (partial info, never full key)
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: { message: "未登录" } }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });

  return NextResponse.json({ data: keys });
}

// POST — generate new API key (full key returned ONCE)
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: { message: "未登录" } }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));

  // Deactivate old keys (keep only latest 3 active)
  const activeKeys = await prisma.apiKey.count({ where: { userId, isActive: true } });
  if (activeKeys >= 3) {
    const oldest = await prisma.apiKey.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (oldest) await prisma.apiKey.update({ where: { id: oldest.id }, data: { isActive: false } });
  }

  const apiKey = "sk-" + randomBytes(24).toString("hex");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  await prisma.apiKey.create({
    data: {
      userId,
      keyHash,
      name: name || `Key-${Date.now().toString(36)}`,
      prefix: apiKey.slice(0, 7),
      rateLimit: 1000,
    },
  });

  return NextResponse.json({ apiKey, message: "新 Key 已生成，请立即保存（仅显示一次）" }, { status: 201 });
}
