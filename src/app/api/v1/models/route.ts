/**
 * Anthropic Models API — returns available models for Claude Code validation.
 * Reads from database, NOT hardcoded — stays in sync with admin panel.
 */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const dbModels = await prisma.model.findMany({
      where: { status: "active" },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, createdAt: true },
    });

    const data = dbModels.map((m) => {
      // Strip provider prefix for Anthropic-compatible model id
      const id = m.slug.includes("/") ? m.slug.split("/")[1] : m.slug;
      return {
        type: "model" as const,
        id,
        display_name: m.name,
        created_at: (m.createdAt || new Date()).toISOString(),
      };
    });

    return Response.json({
      data,
      has_more: false,
      first_id: data[0]?.id || null,
      last_id: data[data.length - 1]?.id || null,
    });
  } catch (err) {
    console.error("[models] DB query failed:", err);
    // Fallback: return empty list rather than crashing
    return Response.json({
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
  }
}
