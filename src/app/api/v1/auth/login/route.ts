import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

const JWT_SECRET = new TextEncoder().encode(
  process.env.KEY_ENCRYPTION_SECRET || "dev-secret-change-in-production-00000000000000000000000000000000"
);

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json(
      { error: { message: "邮箱和密码不能为空", type: "invalid_request", code: 400 } },
      { status: 400 },
    );
  }

  // Find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: { message: "邮箱或密码错误", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  // Set password on first login if not set
  if (!user.passwordHash) {
    const salt = randomBytes(16).toString("hex");
    const hash = createHash("sha256").update(salt + password).digest("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: `${salt}:${hash}` },
    });
    user.passwordHash = `${salt}:${hash}`;
  }

  // Verify password
  const [salt, storedHash] = user.passwordHash.split(":");
  const computedHash = createHash("sha256").update(salt + password).digest("hex");
  if (computedHash !== storedHash) {
    return NextResponse.json(
      { error: { message: "邮箱或密码错误", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  // Create JWT
  const token = await new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const response = NextResponse.json({ message: "登录成功", email: user.email });
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
