export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

import { checkRegistrationAbuse } from "@/lib/abuse";

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json();

  // Anti-abuse: IP rate limit
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const abuseCheck = await checkRegistrationAbuse(ip);
  if (!abuseCheck.allowed) {
    return NextResponse.json({ error: { message: abuseCheck.reason, type: "rate_limited", code: 429 } }, { status: 429 });
  }

  if (!email) {
    return NextResponse.json(
      { error: { message: "邮箱不能为空", type: "invalid_request_error", code: 400 } },
      { status: 400 },
    );
  }

  // Check duplicate
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: { message: "该邮箱已注册", type: "duplicate_error", code: 409 } },
      { status: 409 },
    );
  }

  // Generate API key
  const apiKey = "sk-" + randomBytes(24).toString("hex");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  // Hash password
  const salt = randomBytes(16).toString("hex");
  const passwordHash = password
    ? `${salt}:${createHash("sha256").update(salt + password).digest("hex")}`
    : null;

  // Create user + API key in transaction
  const user = await prisma.$transaction(async (tx: any) => {
    const u = await tx.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
        trustLevel: "L0",
        creditBalance: 0.1,
      },
    });

    await tx.apiKey.create({
      data: {
        userId: u.id,
        keyHash,
        name: "Default",
        prefix: apiKey.slice(0, 4),
        rateLimit: 100,
      },
    });

    await tx.transaction.create({
      data: {
        userId: u.id,
        amount: 0.1,
        type: "topup",
        description: "Welcome credits",
        balanceAfter: 0.1,
      },
    });

    return u;
  });

  // Create JWT for auto-login
  const token = await new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const response = NextResponse.json({
    userId: user.id,
    email: user.email,
    apiKey,
    message: "注册成功！请保存你的 API Key",
  }, { status: 201 });

  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
