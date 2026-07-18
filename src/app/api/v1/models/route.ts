/**
 * Anthropic Models API — returns available models for Claude Code validation
 */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  // Return Anthropic-compatible models list
  return Response.json({
    data: [
      { type: "model", id: "claude-sonnet-5", display_name: "Claude Sonnet 5", created_at: "2026-06-29T00:00:00Z" },
      { type: "model", id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6", created_at: "2026-02-17T00:00:00Z" },
      { type: "model", id: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5", created_at: "2025-09-29T00:00:00Z" },
      { type: "model", id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4", created_at: "2025-05-14T00:00:00Z" },
      { type: "model", id: "claude-opus-4-8", display_name: "Claude Opus 4.8", created_at: "2026-05-28T00:00:00Z" },
      { type: "model", id: "claude-opus-4-7", display_name: "Claude Opus 4.7", created_at: "2026-04-14T00:00:00Z" },
      { type: "model", id: "claude-opus-4-6", display_name: "Claude Opus 4.6", created_at: "2026-02-04T00:00:00Z" },
      { type: "model", id: "claude-opus-4-20250514", display_name: "Claude Opus 4", created_at: "2025-05-14T00:00:00Z" },
      { type: "model", id: "claude-opus-4-1-20250805", display_name: "Claude Opus 4.1", created_at: "2025-08-05T00:00:00Z" },
      { type: "model", id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", created_at: "2025-10-15T00:00:00Z" },
      { type: "model", id: "claude-fable-5", display_name: "Claude Fable 5", created_at: "2026-06-07T00:00:00Z" },
      { type: "model", id: "claude-3.5-sonnet", display_name: "Claude 3.5 Sonnet", created_at: "2024-10-22T00:00:00Z" },
      { type: "model", id: "claude-3.5-haiku", display_name: "Claude 3.5 Haiku", created_at: "2024-10-22T00:00:00Z" },
      { type: "model", id: "claude-3-opus", display_name: "Claude 3 Opus", created_at: "2024-02-29T00:00:00Z" },
    ],
    has_more: false,
    first_id: "claude-sonnet-5",
    last_id: "claude-3-opus",
  });
}
