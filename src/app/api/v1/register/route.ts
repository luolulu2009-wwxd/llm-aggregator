export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { email, name } = await req.json();

  if (!email) {
    return Response.json(
      { error: { message: "Email is required", type: "invalid_request_error", code: 400 } },
      { status: 400 },
    );
  }

  // Check duplicate
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: { message: "Email already registered", type: "duplicate_error", code: 409 } },
      { status: 409 },
    );
  }

  // Generate API key
  const apiKey = "sk-" + randomBytes(24).toString("hex");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  // Create user + API key in transaction
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        trustLevel: "L0",
        creditBalance: 0.1, // welcome credits
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

    // Welcome credits transaction
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

  return Response.json(
    {
      userId: user.id,
      email: user.email,
      apiKey,
      message: "Registration successful. Save your API key — it won't be shown again.",
    },
    { status: 201 },
  );
}
