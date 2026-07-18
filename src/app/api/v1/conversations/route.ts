export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/memory";

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
  const cursor = url.searchParams.get("cursor") || undefined;

  const result = await listConversations(auth.userId, take, cursor);
  return Response.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const { title } = await req.json().catch(() => ({}));
  const conversation = await createConversation(auth.userId, title);
  return Response.json(conversation, { status: 201 });
}
