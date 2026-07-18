export const dynamic = "force-dynamic";
import { getRouteStats } from "@/lib/router";

export async function GET() {
  const stats = await getRouteStats();
  return Response.json({ data: stats });
}
