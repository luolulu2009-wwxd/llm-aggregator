export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — bind TRON wallet address for auto-topup
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const { tronAddress } = await req.json().catch(() => ({}));
  if (!tronAddress || typeof tronAddress !== "string" || !tronAddress.match(/^T[a-zA-Z0-9]{33}$/)) {
    return NextResponse.json(
      { error: { message: "请提供有效的 TRON 钱包地址（以 T 开头的 34 位地址）" } },
      { status: 400 }
    );
  }

  // Check duplicate — one address can only be bound to one user
  const existing = await prisma.user.findFirst({
    where: { tronAddress: tronAddress.toUpperCase() },
    select: { id: true },
  });
  if (existing && existing.id !== auth.userId) {
    return NextResponse.json(
      { error: { message: "该地址已被其他用户绑定" } },
      { status: 409 }
    );
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { tronAddress: tronAddress.toUpperCase() },
  });

  return NextResponse.json({
    message: "TRON 钱包地址绑定成功！充值 USDT 到聚合站地址后将自动入账。",
    tronAddress: tronAddress.toUpperCase(),
    aggregatorAddress: process.env.USDT_ADDRESS || "TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5",
  });
}

// GET — get current bound address
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { tronAddress: true },
  });

  return NextResponse.json({
    tronAddress: user?.tronAddress || null,
    aggregatorAddress: process.env.USDT_ADDRESS || "TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5",
  });
}
