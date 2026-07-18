export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getConversation, deleteConversation, updateConversationTitle } from "@/lib/memory";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const { id } = await params;
  try {
    const conv = await getConversation(id, auth.userId);
    if (!conv) return Response.json({ error: { message: "Not found" } }, { status: 404 });
    return Response.json(conv);
  } catch {
    return Response.json({ error: { message: "Not found" } }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const { id } = await params;
  try {
    await deleteConversation(id, auth.userId);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: { message: "Not found" } }, { status: 404 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const { id } = await params;
  const { title } = await req.json();
  try {
    const conv = await updateConversationTitle(id, auth.userId, title);
    return Response.json(conv);
  } catch {
    return Response.json({ error: { message: "Not found" } }, { status: 404 });
  }
}
