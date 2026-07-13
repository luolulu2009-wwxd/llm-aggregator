export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rules = await prisma.routeRule.findMany({ orderBy: { priority: "desc" } });
  return Response.json({ data: rules });
}

export async function POST(req: NextRequest) {
  const { intent, keywords, targetModel, priority } = await req.json();
  if (!intent || !targetModel) {
    return Response.json({ error: { message: "intent and targetModel required" } }, { status: 400 });
  }
  const rule = await prisma.routeRule.upsert({
    where: { id: intent },
    update: { keywords, targetModel, priority: priority || 10 },
    create: { id: intent, intent, keywords: keywords || "", targetModel, priority: priority || 10, confidence: 0.8, isActive: true },
  });
  return Response.json(rule, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { intent } = await req.json();
  await prisma.routeRule.delete({ where: { id: intent } });
  return Response.json({ ok: true });
}
