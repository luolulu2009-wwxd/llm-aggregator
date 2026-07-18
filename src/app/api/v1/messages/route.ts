/**
 * Anthropic Messages API — Claude Code / Cursor compatible endpoint.
 */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { validateApiKey } from "@/lib/auth";
import { selectBestKey } from "@/lib/keys";
import { decrypt } from "@/lib/crypto";
import { classifyPrompt, DEFAULT_MODEL } from "@/lib/router";
import { checkContent } from "@/lib/safety";
import { checkRateLimit } from "@/lib/ratelimit";
import { evaluateTrustLevel } from "@/lib/trust";
import { getRedis } from "@/lib/redis";
import { recordUsage } from "@/lib/billing";
import { retrieveMemory, injectMemoryIntoMessages, saveMessages, createMemoryFragments, createConversation } from "@/lib/memory";
import { getQueryEmbedding } from "@/lib/embedding";

let redisReady = false;

// Map Claude/Anthropic model names to our internal slugs
const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-sonnet-4.6": "anthropic/claude-sonnet-4-6",
  "claude-opus-4-8": "anthropic/claude-opus-4-8",
  "claude-opus-4.8": "anthropic/claude-opus-4-8",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5-20251001",
  "claude-fable-5": "anthropic/claude-fable-5",
  "claude-3.5-sonnet": "anthropic/claude-sonnet-4-5-20250929",
  "claude-3.5-haiku": "anthropic/claude-haiku-4-5-20251001",
  "claude-3-opus": "anthropic/claude-opus-4-1-20250805",
  "claude-opus-4-7": "anthropic/claude-opus-4-7",
  "claude-opus-4-6": "anthropic/claude-opus-4-6",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5-20250929",
};

function mapModel(anthropicModel: string | undefined): string {
  if (!anthropicModel || anthropicModel === "auto") return "auto";
  return MODEL_MAP[anthropicModel] || "auto";
}

export async function POST(req: NextRequest) {
  if (!redisReady) { await getRedis(); redisReady = true; }

  // Auth
      const rawKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer /, "") || null;
  if (!rawKey || (!rawKey.startsWith("sk-") && !rawKey.startsWith("sk-ant-"))) {
    return Response.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }
  const isAnthropicKey = rawKey.startsWith("sk-ant-");
  const isOAuthToken = !rawKey.startsWith("sk-") && !rawKey.startsWith("sk-ant-");
  const auth = (isAnthropicKey || isOAuthToken) ? { userId: "anthropic-user", apiKeyId: "anthropic-key" } : await validateApiKey(`Bearer ${rawKey}`);
  if (!auth) {
    return Response.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }

  const body = await req.json();
  const isStreaming = body.stream === true;

  // Convert Anthropic messages → OpenAI format
  const systemMsg = body.system;
  const openaiMessages: { role: string; content: string }[] = [];

  if (typeof systemMsg === "string" && systemMsg) {
    openaiMessages.push({ role: "system", content: systemMsg });
  } else if (Array.isArray(systemMsg)) {
    const text = systemMsg.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (text) openaiMessages.push({ role: "system", content: text });
  }

  for (const m of (body.messages || [])) {
    if (typeof m.content === "string") {
      openaiMessages.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      const text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      if (text) openaiMessages.push({ role: m.role, content: text });
    }
  }

  if (!openaiMessages.length) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "No messages" } }, { status: 400 });
  }

  // Safety + Rate limit
  const safety = checkContent(openaiMessages);
  if (!safety.allowed) {
    return Response.json({ type: "error", error: { type: "content_policy_violation", message: safety.reason } }, { status: 422 });
  }
  const trustLevel = await evaluateTrustLevel(auth.userId);
  const rateCheck = await checkRateLimit({ userId: auth.userId, trustLevel });
  if (!rateCheck.allowed) {
    return Response.json({ type: "error", error: { type: "rate_limit_exceeded", message: rateCheck.reason } }, { status: 429 });
  }

  const userMessage = openaiMessages.find(m => m.role === "user")?.content || "";

  // Embedding (shared by routing + memory)
  let queryEmbedding: number[] | null = null;
  try { if (userMessage.length >= 5) queryEmbedding = await getQueryEmbedding(userMessage); } catch {}

  // Model selection — map Claude names → our slugs
  const requestedModel = mapModel(body.model);
  let modelSlug: string;
  let routeReason: string;

  if (requestedModel && requestedModel !== "auto") {
    modelSlug = requestedModel;
    routeReason = "manual";
  } else {
    const classification = await classifyPrompt(userMessage, queryEmbedding);
    if (classification) {
      modelSlug = classification.targetModel;
      routeReason = `rule:${classification.intent}`;
    } else {
      modelSlug = DEFAULT_MODEL;
      routeReason = "rule:default";
    }
  }

  // Memory retrieval
  let finalMessages = openaiMessages;
  try {
    const ctx = await retrieveMemory(userMessage, auth.userId);
    if (ctx) finalMessages = injectMemoryIntoMessages(openaiMessages, ctx);
  } catch {}

  // Key pool — fallback chain
  const provider = modelSlug.split("/")[0];
  const modelName = modelSlug.split("/")[1];
  const modelsFallback = body.models || [];
  let selectedKey = await selectBestKey(provider, modelName);
  let effectiveModel = modelSlug;

  if (!selectedKey && modelsFallback.length > 0) {
    for (const fb of modelsFallback) {
      const [fp, fm] = fb.split("/");
      const fk = await selectBestKey(fp, fm);
      if (fk) { selectedKey = fk; effectiveModel = fb; routeReason += " → fallback:model"; break; }
    }
  }

  // If Claude model not found, auto-route as fallback
  if (!selectedKey) {
    selectedKey = await selectBestKey("deepseek", "deepseek-chat");
    if (selectedKey) { effectiveModel = "deepseek/deepseek-chat"; routeReason += " → fallback:deepseek"; }
  }

  if (!selectedKey) {
    return Response.json({ type: "error", error: { type: "capacity_error", message: "No available keys" } }, { status: 503 });
  }

    let apiKey: string;
if (isAnthropicKey || isOAuthToken) {
  apiKey = rawKey;
} else {
  try { apiKey = decrypt(selectedKey.keyEncrypted); } catch {
    return Response.json({ type: "error", error: { type: "internal_error", message: "Key decryption failed" } }, { status: 500 });
  }
}

  const adapter = getAdapter(effectiveModel);
  if (!adapter) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: `Unknown model: ${effectiveModel}` } }, { status: 400 });
  }
  if (isAnthropicKey || isOAuthToken) {
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!anthropicResp.ok) {
const errText = (await anthropicResp.text().catch(() => "")).slice(0, 500);
      return Response.json({ type: "error", error: { type: "upstream_error", message: `Anthropic ${anthropicResp.status}: ${errText}` } }, { status: 502 });
    }
    if (isStreaming) {
      return new Response(anthropicResp.body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }
    const data = await anthropicResp.json();
    return Response.json(data);
  }
  // Build + fetch upstream
  const built = adapter.buildRequest({
    model: effectiveModel.split("/")[1],
    messages: finalMessages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    stop: body.stop_sequences || body.stop,
    stream: isStreaming,
  }, apiKey);

  try {
    const fetchFn = built.dispatcher ? (await import("undici")).fetch : fetch;
    const resp = await fetchFn(built.url, {
      method: "POST", headers: built.headers,
      body: JSON.stringify(built.body),
      ...(built.dispatcher ? { dispatcher: built.dispatcher } : {}),
    }) as Response;

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "").then(t => t.slice(0, 500));
      return Response.json({ type: "error", error: { type: "upstream_error", message: `Upstream ${resp.status}: ${errText}` } }, { status: 502 });
    }

    if (isStreaming) {
      if (provider === "anthropic") {
        return new Response(resp.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
      return streamAnthropicSSE(resp, auth, selectedKey, effectiveModel, provider, routeReason, openaiMessages);
    }

    const data = await resp.json();
    const usage = adapter.extractUsage(data);
    const parsed = adapter.parseResponse(data);
    const assistantContent = parsed.choices?.[0]?.message?.content || "";

    // Billing
    if (selectedKey) {
      recordUsage({ userId: auth.userId, apiKeyId: auth.apiKeyId, providerKeyId: selectedKey.id, modelSlug, provider, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, routeReason, isStreaming: false, durationMs: 0 }).catch(() => {});
    }

    // Memory
    const conv = await createConversation(auth.userId).catch(() => null);
    if (conv && assistantContent) {
      saveMessages({ conversationId: conv.id, messages: [...openaiMessages, { role: "assistant", content: assistantContent }], provider, modelSlug }).catch(() => {});
      createMemoryFragments({ userId: auth.userId, conversationId: conv.id, messages: openaiMessages, responseContent: assistantContent, modelSlug }).catch(() => {});
    }

    return Response.json({
      id: `msg_${parsed.id || Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: assistantContent }],
      model: effectiveModel,
      stop_reason: parsed.choices?.[0]?.finish_reason === "stop" ? "end_turn" : "max_tokens",
      stop_sequence: null,
      usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens },
    });
  } catch (err) {
    return Response.json({ type: "error", error: { type: "internal_error", message: err instanceof Error ? err.message : "Internal error" } }, { status: 500 });
  }
}

/** Translate OpenAI SSE stream → Anthropic SSE format for Claude Code compatibility */
function streamAnthropicSSE(
  resp: Response,
  auth: { userId: string; apiKeyId: string },
  selectedKey: { id: string } | undefined,
  modelSlug: string,
  provider: string,
  routeReason: string,
  openaiMessages: { role: string; content: string }[],
) {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let lastUsage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let messageStarted = false;
  let contentBlockStarted = false;
  let stopped = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(encoder.encode(s));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta;
              const content = delta?.content;

              if (content) {
                if (!messageStarted) {
                  enqueue("event: message_start\ndata: {\"type\":\"message\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"deepseek\",\"usage\":null}}\n\n");
                  messageStarted = true;
                }
                if (!contentBlockStarted) {
                  enqueue("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n");
                  contentBlockStarted = true;
                }
                enqueue(`event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":${JSON.stringify(content)}}}\n\n`);
                fullContent += content;
              }

              if (json.usage) {
                lastUsage = { prompt_tokens: json.usage.prompt_tokens || 0, completion_tokens: json.usage.completion_tokens || 0 };
              }
            } catch {}
          }
        }
      } finally {
        // Send stop events
        if (contentBlockStarted) {
          enqueue("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
        }
        const stopReason = "end_turn";
        enqueue(`event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"${stopReason}\"},\"usage\":{\"input_tokens\":${lastUsage?.prompt_tokens || 0},\"output_tokens\":${lastUsage?.completion_tokens || Math.ceil(fullContent.length / 3)}}}\n\n`);
        enqueue("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
        controller.close();

        // Billing + memory (fire-and-forget)
        const tokens = lastUsage || { prompt_tokens: 0, completion_tokens: Math.ceil(fullContent.length / 3) };
        if (selectedKey) {
          recordUsage({ userId: auth.userId, apiKeyId: auth.apiKeyId, providerKeyId: selectedKey.id, modelSlug, provider, promptTokens: tokens.prompt_tokens, completionTokens: tokens.completion_tokens, routeReason, isStreaming: true, durationMs: 0 }).catch(() => {});
        }
        if (fullContent) {
          createConversation(auth.userId).then(conv => {
            if (!conv) return;
            saveMessages({ conversationId: conv.id, messages: [...openaiMessages, { role: "assistant", content: fullContent }], provider, modelSlug }).catch(() => {});
            createMemoryFragments({ userId: auth.userId, conversationId: conv.id, messages: openaiMessages, responseContent: fullContent, modelSlug }).catch(() => {});
          }).catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
