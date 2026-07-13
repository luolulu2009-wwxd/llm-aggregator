export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { listFlaggedUsers, freezeUser, banUser } from "@/lib/abuse";

// GET — list flagged users/events
export async function GET() {
  const events = await listFlaggedUsers();
  return Response.json({ data: events });
}

// POST — freeze or ban user
export async function POST(req: NextRequest) {
  const { userId, action, reason } = await req.json();
  if (!userId || !action) {
    return Response.json({ error: { message: "userId and action required" } }, { status: 400 });
  }

  if (action === "freeze") {
    await freezeUser(userId, reason || "管理员冻结");
    return Response.json({ message: "用户已冻结" });
  } else if (action === "ban") {
    await banUser(userId, reason || "管理员封禁");
    return Response.json({ message: "用户已封禁" });
  }

  return Response.json({ error: { message: "action must be freeze or ban" } }, { status: 400 });
}
