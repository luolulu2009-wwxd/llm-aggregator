export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { validateApiKey } from "@/lib/auth";
import { selectBestKey } from "@/lib/keys";
import { decrypt } from "@/lib/crypto";
import { classifyPrompt, DEFAULT_MODEL } from "@/lib/router";
import { classifyComplexity } from "@/lib/classifier";
import { checkContent } from "@/lib/safety";
import { checkRateLimit } from "@/lib/ratelimit";
import { evaluateTrustLevel } from "@/lib/trust";
import { getRedis } from "@/lib/redis";
import { recordUsage } from "@/lib/billing";
import { detectSelfDealing, checkEarningsAnomaly } from "@/lib/abuse";
import { retrieveMemory, injectMemoryIntoMessages, saveMessages, createMemoryFragments, createConversation } from "@/lib/memory";
import { getQueryEmbedding } from "@/lib/embedding";

// Lazy-init Redis on first request
let redisReady = false;

export async function POST(req: NextRequest) {
  // --- Redis init (first request only) ---
  if (!redisReady) {
    await getRedis();
    redisReady = true;
  }

  // --- Auth ---
  const auth = await validateApiKey(req.headers.get("authorization"));
  if (!auth) {
    return Response.json(
      { error: { message: "Invalid API key", type: "authentication_error", code: 401 } },
      { status: 401 },
    );
  }

  const body = await req.json();

  // --- Content Safety (#14) ---
  const safetyResult = checkContent(body.messages || []);
  if (!safetyResult.allowed) {
    return Response.json(
      { error: { message: safetyResult.reason, type: "content_policy_violation", code: 422 } },
      { status: 422 },
    );
  }

  // --- Rate Limiting (#15) ---
  const trustLevel = await evaluateTrustLevel(auth.userId);
  const rateCheck = await checkRateLimit({ userId: auth.userId, trustLevel });
  if (!rateCheck.allowed) {
    return Response.json(
      { error: { message: rateCheck.reason, type: "rate_limit_exceeded", code: 429 } },
      { status: 429 },
    );
  }

  const isStreaming = body.stream === true;
  const userMessage = body.messages?.find((m: any) => m.role === "user")?.content || "";
  const requestedConvId = body.conversation_id || null;

  // --- Embedding (once, shared by memory + routing) — local BGE model, no API key needed ---
  let queryEmbedding: number[] | null = null;
  try {
    if (userMessage.length >= 5) {
      queryEmbedding = await getQueryEmbedding(userMessage);
    }
  } catch { /* embedding failure never blocks */ }

  // --- Model Selection (#8 + #9) ---
  let modelSlug: string;
  let routeReason: string;

  // Map common model names to our internal slugs (kept in sync with /messages route)
  const MODEL_ALIASES: Record<string, string> = {
    "claude-sonnet-5": "anthropic/claude-sonnet-5",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
    "claude-sonnet-4.6": "anthropic/claude-sonnet-4-6",
    "claude-sonnet-4-20250514": "anthropic/claude-sonnet-5",
    "claude-sonnet-4": "anthropic/claude-sonnet-5",
    "claude-opus-4-8": "anthropic/claude-opus-4-8",
    "claude-opus-4.8": "anthropic/claude-opus-4-8",
    "claude-opus-4-7": "anthropic/claude-opus-4-7",
    "claude-opus-4-6": "anthropic/claude-opus-4-6",
    "claude-opus-4": "anthropic/claude-opus-4-8",
    "claude-haiku-4-5": "anthropic/claude-haiku-4-5-20251001",
    "claude-haiku-4": "anthropic/claude-haiku-4-5",
    "claude-fable-5": "anthropic/claude-fable-5",
    "claude-3.5-sonnet": "anthropic/claude-sonnet-4-5-20250929",
    "claude-3.5-haiku": "anthropic/claude-haiku-4-5-20251001",
    "claude-3-opus": "anthropic/claude-opus-4-1-20250805",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5-20250929",
    "gpt-4o": "openai/gpt-4o",
    "gpt-5": "openai/gpt-5",
  };

  if (body.model && body.model !== "auto") {
    modelSlug = MODEL_ALIASES[body.model] || body.model;
    routeReason = "manual";
  } else {
    // Smart routing: intent match → complexity-based tiered selection
    const classification = await classifyPrompt(userMessage, queryEmbedding);
    if (classification) {
      modelSlug = classification.targetModel;
      routeReason = `rule:${classification.intent}`;
    } else {
      // Cost-optimal: score message complexity → pick the right model tier
      const convLen = (body.messages || []).reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);
      const complexity = classifyComplexity(userMessage, convLen);
      modelSlug = complexity.primaryModel;
      routeReason = `auto:${complexity.complexity}(s${complexity.score})`;
    }
  }

  // --- Memory Retrieval & Injection (#Memory) ---
  let messagesWithMemory = body.messages;
  try {
    const memoryCtx = await retrieveMemory(userMessage, auth.userId);
    if (memoryCtx) {
      messagesWithMemory = injectMemoryIntoMessages(body.messages, memoryCtx);
    }
  } catch { /* memory failure never blocks */ }

  // --- Provider selection from Key Pool (parallel, with ultimate fallback) ---
  const provider = modelSlug.split("/")[0];
  const modelName = modelSlug.split("/")[1];
  const modelsFallback = body.models || [];

  // Try primary + fallback keys in parallel
  const fallbackCandidates = modelsFallback.length > 0
    ? modelsFallback.map((fb: string) => fb.split("/")[0]).filter((p: string) => p !== provider)
    : [];

  const keyResults = await Promise.all([
    selectBestKey(provider, modelName),
    ...fallbackCandidates.map((p: string) => selectBestKey(p, modelName)),
    selectBestKey("deepseek", "deepseek-chat"), // ultimate fallback
  ]);

  let selectedKey = keyResults[0];
  let effectiveModel = modelSlug;

  if (!selectedKey && modelsFallback.length > 0) {
    for (let i = 0; i < modelsFallback.length; i++) {
      if (keyResults[i + 1]) {
        selectedKey = keyResults[i + 1];
        effectiveModel = modelsFallback[i];
        routeReason += " → fallback:model";
        break;
      }
    }
  }

  if (!selectedKey && keyResults[keyResults.length - 1]) {
    selectedKey = keyResults[keyResults.length - 1];
    effectiveModel = "deepseek/deepseek-v4-pro";
    routeReason += " → fallback:deepseek";
  }

  if (!selectedKey) {
    return Response.json(
      {
        error: {
          message: `No available keys for model "${modelSlug}". All keys are exhausted or rate-limited.`,
          type: "capacity_error",
          code: 503,
        },
      },
      { status: 503 },
    );
  }

  // --- Decrypt the selected key ---
  let providerApiKey: string;
  try {
    providerApiKey = decrypt(selectedKey.keyEncrypted);
  } catch {
    return Response.json(
      { error: { message: "Key decryption failed", type: "internal_error", code: 500 } },
      { status: 500 },
    );
  }

  // --- Get adapter ---
  const adapter = getAdapter(effectiveModel);
  if (!adapter) {
    return Response.json(
      { error: { message: `Unknown model: ${effectiveModel}`, type: "invalid_request_error", code: 400 } },
      { status: 400 },
    );
  }

  // --- Build provider-native request ---
  const built = adapter.buildRequest(
    {
      model: effectiveModel.split("/")[1],
      messages: messagesWithMemory,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      stop: body.stop,
      stream: isStreaming ?? false,
    },
    providerApiKey,
  );
  const { url, headers, body: nativeBody, dispatcher } = built;

  // Memory opts for response handlers (always on — auto-creates conversation if needed)
  const memOpts = {
    requestedConvId,
    messages: body.messages,
    userId: auth.userId,
  };

  try {
    let response = await doFetch(url, headers, nativeBody, dispatcher);

    // --- Fallback on failure (#10): Provider → Model chain ---
    const shouldFallback = !response.ok && (response.status >= 500 || response.status === 403 || response.status === 429);
    if (shouldFallback) {
      // Step 1: Provider fallback — same model, different key
      const retryKey = await selectBestKey(provider, modelName);
      if (retryKey && retryKey.id !== selectedKey.id) {
        let retryApiKey: string;
        try { retryApiKey = decrypt(retryKey.keyEncrypted); } catch { /* skip */ }
        if (retryApiKey!) {
          const retryResp = await tryCall(adapter!, effectiveModel, body, retryApiKey, isStreaming);
          if (retryResp && retryResp.ok) {
            return isStreaming ? streamResponse(retryResp, adapter!, auth, retryKey?.id, effectiveModel, provider, routeReason, memOpts) : jsonResponse(retryResp, adapter!, auth, selectedKey?.id, effectiveModel, provider, routeReason, memOpts);
          }
        }
      }

      // Step 2: Model fallback — try next model in `models` array
      for (const fallbackModel of modelsFallback) {
        const fbProvider = fallbackModel.split("/")[0];
        const fbModel = fallbackModel.split("/")[1];
        const fbKey = await selectBestKey(fbProvider, fbModel);
        if (fbKey) {
          const fbAdapter = getAdapter(fallbackModel);
          if (fbAdapter) {
            let fbApiKey: string;
            try { fbApiKey = decrypt(fbKey.keyEncrypted); } catch { continue; }
            const fbResp = await tryCall(fbAdapter, fallbackModel, body, fbApiKey, isStreaming);
            if (fbResp && fbResp.ok) {
              routeReason += " → fallback:model";
              return isStreaming ? streamResponse(fbResp, fbAdapter, auth, fbKey.id, fallbackModel, fbProvider, routeReason, memOpts) : jsonResponse(fbResp, fbAdapter, auth, fbKey.id, fallbackModel, fbProvider, routeReason, memOpts);
            }
          }
        }
      }
    }

    if (!response.ok) {
      return errorResponse(response.status);
    }

    if (isStreaming) {
      return streamResponse(response, adapter, auth, selectedKey?.id, effectiveModel, provider, routeReason, memOpts);
    }

    return jsonResponse(response, adapter, auth, selectedKey?.id, effectiveModel, provider, routeReason, memOpts);
  } catch (err) {
    return Response.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Internal server error",
          type: "internal_error",
          code: 500,
        },
      },
      { status: 500 },
    );
  }
}

// --- Helpers ---

/** Make a provider API call, return response or null on failure */
async function tryCall(
  adapter: ReturnType<typeof getAdapter>,
  modelSlug: string,
  body: any,
  apiKey: string,
  stream: boolean,
): Promise<Response | null> {
  const built = adapter!.buildRequest(
    {
      model: modelSlug.split("/")[1],
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      stop: body.stop,
      stream: stream ?? false,
    },
    apiKey,
  );
  try {
    const resp = await doFetch(built.url, built.headers, built.body, built.dispatcher);
    return resp;
  } catch {
    return null;
  }
}

/** Fetch wrapper that respects dispatcher (proxy) */
async function doFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  dispatcher?: any,
): Promise<Response> {
  if (dispatcher) {
    // Use undici's fetch which supports dispatcher for proxy
    const { fetch: undiciFetch } = await import("undici");
    return undiciFetch(url, { method: "POST", headers, body: JSON.stringify(body), dispatcher }) as unknown as Response;
  }
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function jsonResponse(
  response: Response,
  adapter: ReturnType<typeof getAdapter>,
  auth: { userId: string; apiKeyId: string },
  keyId: string | undefined,
  modelSlug: string,
  provider: string,
  routeReason: string,
  memoryOpts?: { requestedConvId: string | null; messages: any[]; userId: string },
) {
  const data = await response.json();
  const usage = adapter!.extractUsage(data);

  // Record billing asynchronously (don't block response)
  if (keyId) {
    recordUsage({
      userId: auth.userId, apiKeyId: auth.apiKeyId, providerKeyId: keyId,
      modelSlug, provider,
      promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
      routeReason, isStreaming: false, durationMs: 0,
    }).catch(() => {});
  }

  // Save messages + create memory fragment (always on, auto-creates conversation)
  if (memoryOpts) {
    const assistantContent = data.choices?.[0]?.message?.content || "";
    const convId = memoryOpts.requestedConvId
      || (await createConversation(memoryOpts.userId).catch(() => null))?.id;
    if (convId) {
      await saveMessages({
        conversationId: convId,
        messages: memoryOpts.messages,
        provider,
        modelSlug,
      }).catch(() => {});
      if (assistantContent) {
        await createMemoryFragments({
          userId: auth.userId,
          conversationId: convId,
          messages: memoryOpts.messages,
          responseContent: assistantContent,
          modelSlug,
        }).catch(() => {});
      }
    }
  }

  const standard = adapter!.parseResponse(data);
  return Response.json(standard);
}

function streamResponse(
  response: Response,
  adapter: ReturnType<typeof getAdapter>,
  auth: { userId: string; apiKeyId: string },
  keyId: string | undefined,
  modelSlug: string,
  provider: string,
  routeReason: string,
  memoryOpts?: { requestedConvId: string | null; messages: any[]; userId: string },
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let fullContent = "";
  let lastUsage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let messageStarted = false;
  let contentBlockStarted = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(encoder.encode(s));

      const ensureStarted = () => {
        if (!messageStarted) {
          enqueue("event: message_start\ndata: {\"type\":\"message\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"deepseek\",\"usage\":null}}\n\n");
          messageStarted = true;
        }
        if (!contentBlockStarted) {
          enqueue("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n");
          contentBlockStarted = true;
        }
      };

      const sendStop = () => {
        if (contentBlockStarted) {
          enqueue("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
        }
        const stopReason = "end_turn";
        const usage = lastUsage || { prompt_tokens: 0, completion_tokens: Math.ceil(fullContent.length / 3) };
        enqueue(`event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"${stopReason}\"},\"usage\":{\"input_tokens\":${usage.prompt_tokens},\"output_tokens\":${usage.completion_tokens}}}\n\n`);
        enqueue("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });

          if (text.includes("data: [DONE]")) {
            sendStop();
            continue;
          }

          const lines = text.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta;
              const content = delta?.content;
              const finishReason = json.choices?.[0]?.finish_reason;

              if (finishReason && finishReason !== "null" && finishReason !== null) {
                if (content) {
                  ensureStarted();
                  enqueue(`event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":${JSON.stringify(content)}}}\n\n`);
                  fullContent += content;
                }
                sendStop();
                if (json.usage) {
                  lastUsage = { prompt_tokens: json.usage.prompt_tokens || 0, completion_tokens: json.usage.completion_tokens || 0 };
                }
                break;
              }

              if (content) {
                ensureStarted();
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
        if (contentBlockStarted || messageStarted) {
          try { sendStop(); } catch {}
        }
        controller.close();

        const tokens = lastUsage || {
          prompt_tokens: 0,
          completion_tokens: Math.ceil(fullContent.length / 3),
        };

        if (keyId) {
          recordUsage({
            userId: auth.userId, apiKeyId: auth.apiKeyId, providerKeyId: keyId,
            modelSlug, provider,
            promptTokens: tokens.prompt_tokens, completionTokens: tokens.completion_tokens,
            routeReason, isStreaming: true, durationMs: 0,
          }).catch(() => {});
        }

        if (memoryOpts && fullContent) {
          const convId = memoryOpts.requestedConvId
            || await createConversation(memoryOpts.userId).catch(() => null).then(c => c?.id).catch(() => null);
          if (convId) {
            saveMessages({
              conversationId: convId,
              messages: [...memoryOpts.messages, { role: "assistant", content: fullContent }],
              provider,
              modelSlug,
            }).catch(() => {});
            createMemoryFragments({
              userId: auth.userId,
              conversationId: convId,
              messages: memoryOpts.messages,
              responseContent: fullContent,
              modelSlug,
            }).catch(() => {});
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
function errorResponse(status: number) {
  return Response.json(
    {
      error: {
        message: `Upstream provider returned ${status}`,
        type: "upstream_error",
        code: status,
      },
    },
    { status: status >= 500 ? 502 : status },
  );
}
