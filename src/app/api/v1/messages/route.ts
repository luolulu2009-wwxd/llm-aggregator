/**
 * Anthropic Messages API — Claude Code / Cursor compatible endpoint.
 */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { validateApiKey, hashKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { selectBestKey } from "@/lib/keys";
import { decrypt } from "@/lib/crypto";
import { getCircuit } from "@/lib/circuit";
import { classifyPrompt, DEFAULT_MODEL } from "@/lib/router";
import { classifyComplexity, costSavings } from "@/lib/classifier";
import { rankCandidates } from "@/lib/weights";
import { recordSuccess, recordFailure, loadFromRedis } from "@/lib/metrics";

// Load persisted metrics on first request
let metricsLoaded = false;
import { checkContent } from "@/lib/safety";
import { checkRateLimit } from "@/lib/ratelimit";
import { evaluateTrustLevel } from "@/lib/trust";
import { getRedis } from "@/lib/redis";
import { addTrace } from "@/app/api/v1/admin/debug/route";
import { recordUsage, checkBalance } from "@/lib/billing";
import { retrieveMemory, injectMemoryIntoMessages, saveMessages, createMemoryFragments, createConversation } from "@/lib/memory";
import { getQueryEmbedding } from "@/lib/embedding";

let redisReady = false;

// Map Claude model names → OpenRouter (Anthropic direct key doesn't have API access)
const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-5": "openrouter/claude-sonnet-5",
  "claude-sonnet-4-6": "openrouter/claude-sonnet-4-6",
  "claude-sonnet-4.6": "openrouter/claude-sonnet-4-6",
  "claude-opus-4-8": "openrouter/claude-opus-4-8",
  "claude-opus-4.8": "openrouter/claude-opus-4-8",
  "claude-haiku-4-5": "openrouter/claude-haiku-4-5",
  "claude-fable-5": "openrouter/claude-fable-5",
  "claude-3.5-sonnet": "openrouter/claude-sonnet-5",
  "claude-3.5-haiku": "openrouter/claude-haiku-4-5",
  "claude-3-opus": "openrouter/claude-opus-4-8",
  "claude-opus-4-7": "openrouter/claude-opus-4-7",
  "claude-opus-4-6": "openrouter/claude-opus-4-6",
  "claude-sonnet-4-5": "openrouter/claude-sonnet-5",
};

function mapModel(anthropicModel: string | undefined): string {
  if (!anthropicModel || anthropicModel === "auto") return "auto";
  // Already a valid internal slug (contains provider/ prefix)
  if (anthropicModel.includes("/")) return anthropicModel;
  return MODEL_MAP[anthropicModel] || "auto";
}

export async function POST(req: NextRequest) {
  if (!redisReady) { await getRedis(); redisReady = true; }
  if (!metricsLoaded) { loadFromRedis().then(() => { metricsLoaded = true; }).catch(() => {}); }

  // Auth — support aggregator keys (sk-), OAuth (sk-ant-), and passthrough (non-sk- keys)
  const rawKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer /, "") || null;
  if (!rawKey) {
    return Response.json({ type: "error", error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }

  let auth: { userId: string; apiKeyId: string; isPassthrough?: boolean } | null = null;

  if (rawKey.startsWith("sk-")) {
    if (rawKey.startsWith("sk-ant-")) {
      // OAuth token: auto-create/lookup user + apiKey
      const keyHash = hashKey(rawKey);
      let apiKey = await prisma.apiKey.findFirst({ where: { keyHash }, select: { id: true, userId: true, isActive: true } });
      if (!apiKey) {
        // Auto-register: create user + apiKey from OAuth token
        const user = await prisma.user.create({ data: { email: `oauth-${keyHash.slice(0, 8)}@anon.llm.saylulu.com`, trustLevel: "L0", creditBalance: 1.0 } });
        apiKey = await prisma.apiKey.create({ data: { userId: user.id, keyHash, name: "CC Switch OAuth", prefix: rawKey.slice(0, 7), rateLimit: 100 } });
        await prisma.transaction.create({ data: { userId: user.id, amount: 1.0, type: "topup", description: "OAuth 注册赠送 ¥1", balanceAfter: 1.0 } });
      }
      auth = { userId: apiKey.userId, apiKeyId: apiKey.id };
    } else {
      auth = await validateApiKey(`Bearer ${rawKey}`);
      // Unknown sk- keys (e.g., user's own DeepSeek/OpenAI key) → passthrough, don't reject
      if (!auth) auth = { userId: "anon", apiKeyId: "passthrough", isPassthrough: true };
    }
  } else {
    // Non-sk- keys (JWT, custom tokens, direct provider keys) → skip DB lookup
    auth = { userId: "anon", apiKeyId: "passthrough", isPassthrough: true };
  }

  if (!auth) {
    return Response.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key. Get one at llm.saylulu.com/register" } }, { status: 401 });
  }

  const body = await req.json();
  const isStreaming = body.stream === true;

  // Convert Anthropic tools → OpenAI tools format
  // Anthropic: {name, description, input_schema}
  // OpenAI:   {type:"function", function:{name, description, parameters}}
  const openaiTools = body.tools?.map((t: any) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || {},
    },
  }));

  // Convert Anthropic tool_choice → OpenAI tool_choice
  // Anthropic: {type:"auto"|"any"|"tool"} or {type:"tool", name:"x"}
  // OpenAI:   "auto"|"required"|"none" or {type:"function", function:{name:"x"}}
  let openaiToolChoice: any = undefined;
  if (body.tool_choice) {
    if (typeof body.tool_choice === "string") {
      openaiToolChoice = body.tool_choice; // already OpenAI format
    } else if (body.tool_choice.type === "any" || body.tool_choice.type === "auto") {
      openaiToolChoice = body.tool_choice.type === "any" ? "required" : "auto";
    } else if (body.tool_choice.type === "tool") {
      openaiToolChoice = { type: "function", function: { name: body.tool_choice.name } };
    } else {
      openaiToolChoice = body.tool_choice; // pass through as-is
    }
  }

  // Convert Anthropic messages → OpenAI format (sync, fast)
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
      // Convert Anthropic content blocks → OpenAI format
      // Preserve tool_use and tool_result blocks — critical for Claude Code
      const text = m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const toolUses = m.content.filter((b: any) => b.type === "tool_use");
      const toolResults = m.content.filter((b: any) => b.type === "tool_result");

      if (m.role === "assistant" && toolUses.length > 0) {
        // Assistant with tool_use → convert to OpenAI tool_calls format
        const toolCalls = toolUses.map((tu: any, i: number) => ({
          id: tu.id || `toolu_${i}`,
          type: "function" as const,
          function: { name: tu.name || "", arguments: JSON.stringify(tu.input || {}) },
        }));
        openaiMessages.push({
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls,
        } as any);
      } else if (toolResults.length > 0) {
        // User with tool_result → convert each to OpenAI "tool" role message
        for (const tr of toolResults) {
          openaiMessages.push({
            role: "tool",
            tool_call_id: tr.tool_use_id || "",
            content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content || ""),
          } as any);
        }
        // If there's also text, add it after tool results
        if (text) {
          openaiMessages.push({ role: m.role, content: text });
        }
      } else if (text) {
        // Plain text message — no tools
        openaiMessages.push({ role: m.role, content: text });
      }
    }
  }

  if (!openaiMessages.length) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: "No messages" } }, { status: 400 });
  }

  // Safety (sync, fast text matching)
  const safety = checkContent(openaiMessages);
  if (!safety.allowed) {
    return Response.json({ type: "error", error: { type: "content_policy_violation", message: safety.reason } }, { status: 422 });
  }

  // Rate limit + Trust (can run in parallel; skip for passthrough)
  let trustLevel = "L0";
  let rateCheck: any = { allowed: true, remaining: null, limit: null, resetInSeconds: null };
  if (!auth.isPassthrough) {
    trustLevel = await evaluateTrustLevel(auth.userId);
    rateCheck = await checkRateLimit({ userId: auth.userId, trustLevel });
  }
  const rateLimitRemaining = rateCheck.remaining?.toString();
  const rateLimitTotal = rateCheck.limit?.toString();
  const rateLimitReset = rateCheck.resetInSeconds?.toString();

  // --- Balance pre-check (skip for passthrough) ---
  if (!auth.isPassthrough) {
    const balanceCheck = await checkBalance(auth.userId);
    if (!balanceCheck.sufficient) {
      return Response.json({
        type: "error",
        error: {
          type: "insufficient_balance",
          message: `Insufficient credits. Balance: ¥${balanceCheck.balance.toFixed(4)}, minimum: ¥${balanceCheck.minimum.toFixed(4)}`,
        },
      }, { status: 402, headers: { "X-Balance": balanceCheck.balance.toString() } });
    }
  }

  if (!auth.isPassthrough && !rateCheck.allowed) {
    return Response.json({ type: "error", error: { type: "rate_limit_exceeded", message: rateCheck.reason } }, { status: 429 });
  }

  const userMessage = openaiMessages.find(m => m.role === "user")?.content || "";

  // Model selection — map Claude names → our slugs
  const requestedModel = mapModel(body.model);
  let modelSlug: string;
  let routeReason: string;

  // Track expected vs actual cost for savings reporting
  let costTier: string | undefined;
  let complexity: ReturnType<typeof classifyComplexity> | undefined;

  if (requestedModel && requestedModel !== "auto") {
    modelSlug = requestedModel;
    routeReason = "manual";
  } else {
    // Smart routing: intent match → complexity-based tiered selection
    const classification = await classifyPrompt(userMessage, null);
    if (classification) {
      modelSlug = classification.targetModel;
      routeReason = `rule:${classification.intent}`;
    } else {
      // Cost-optimal: score message complexity → weight engine picks the best model
      const convLen = openaiMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      complexity = classifyComplexity(userMessage, convLen);
      // Weight Engine ranks candidates → best becomes primary
      const ranked = rankCandidates(complexity.candidates, complexity.tier, complexity.language);
      modelSlug = ranked[0];
      complexity.candidates = ranked; // update candidates to ranked order for fallback
      routeReason = `auto:${complexity.complexity}(s${complexity.score})`;
      costTier = complexity.complexity;
    }
  }

  // Key pool — cross-provider parallel fallback chain
  let provider = modelSlug.split("/")[0];
  const modelName = modelSlug.split("/")[1];
  const modelsFallback = body.models || [];

  // Build candidate list: already-ranked by weight engine in auto mode
  const tierCandidates = complexity?.candidates || [];
  const userFallbacks = modelsFallback.length > 0
    ? modelsFallback.filter((fb: string) => fb !== modelSlug)
    : [];

  // All candidates to try in parallel (deduplicated, quality order preserved)
  const seenSlugs = new Set<string>();
  const allCandidates: string[] = [];
  const addCandidate = (slug: string) => {
    if (!seenSlugs.has(slug)) { seenSlugs.add(slug); allCandidates.push(slug); }
  };
  addCandidate(modelSlug);
  for (const fb of [...tierCandidates, ...userFallbacks]) addCandidate(fb);
  // Always ensure DeepSeek is available as ultimate safety net
  addCandidate("deepseek/deepseek-v4-pro");

  const keyResults = await Promise.all(
    allCandidates.map((slug: string) => {
      const [p, m] = slug.split("/");
      return selectBestKey(p, m);
    })
  );
  
  let selectedKey = keyResults[0];
  let effectiveModel = modelSlug;

  // Find first available key across all candidates (respects quality priority ordering)
  if (!selectedKey) {
    for (let i = 1; i < allCandidates.length; i++) {
      if (keyResults[i]) {
        selectedKey = keyResults[i];
        effectiveModel = allCandidates[i];
        routeReason += ` -> fallback:${allCandidates[i].split("/")[0]}`;
        break;
      }
    }
  }

  if (!selectedKey) {
    return Response.json({ type: "error", error: { type: "capacity_error", message: "No available keys" } }, { status: 503 });
  }

  // Memory retrieval — async fire-and-forget (doesn't block response)
  let finalMessages = openaiMessages;
  retrieveMemory(userMessage, auth.userId).then(ctx => {
    // memory loaded async, used for next request
  }).catch(() => {});

    let apiKey: string;
  try { apiKey = decrypt(selectedKey.keyEncrypted); } catch {
    return Response.json({ type: "error", error: { type: "internal_error", message: "Key decryption failed" } }, { status: 500 });
  }

  let adapter = getAdapter(effectiveModel);
  if (!adapter) {
    return Response.json({ type: "error", error: { type: "invalid_request_error", message: `Unknown model: ${effectiveModel}` } }, { status: 400 });
  }
  // Build + fetch upstream (with circuit breaker, timeout, auto-fallback)
  const built = adapter.buildRequest({
    model: effectiveModel.split("/")[1],
    messages: finalMessages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    stop: body.stop_sequences || body.stop,
    stream: isStreaming,
    tools: openaiTools,
    tool_choice: openaiToolChoice,
  }, apiKey);

  let resp: Response | null = null;
  let usedFallback = false;
  let fallbackProvider = "";
  let fetchLatency = 0; // ms, for self-evolving metrics

  // Circuit breaker check — skip provider if consistently failing
  const circuit = getCircuit(provider);
  const circuitStatus = circuit.getStatus();
  const circuitDegraded = circuitStatus.open; // only skip if fully open (3+ consecutive failures)

  if (circuitDegraded) {
    console.warn(`[circuit] ${provider} breaker open, skipping primary`);
    usedFallback = true;
  }

  // Try primary provider
  if (!usedFallback) {
    try {
      const ac = new AbortController();
      const timeoutMs = 30_000; // 30s for all providers
      const timeoutId = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);
      const fetchStart = Date.now();
      const fetchFn = built.dispatcher ? (await import("undici")).fetch : fetch;
      resp = await fetchFn(built.url, {
        method: "POST", headers: built.headers,
        body: JSON.stringify(built.body),
        signal: ac.signal,
        ...(built.dispatcher ? { dispatcher: built.dispatcher } : {}),
      }) as Response;
      clearTimeout(timeoutId);
      fetchLatency = Date.now() - fetchStart;

      if (!resp.ok && (resp.status >= 500 || resp.status === 429 || resp.status === 403)) {
        circuit.recordFailure();
        console.warn(`[fetch] ${provider} returned ${resp.status}, falling back`);
        resp = null;
      } else if (!resp.ok) {
        circuit.recordFailure();
        const errText = await resp.text().catch(() => "").then(t => t.slice(0, 500));
        return Response.json({ type: "error", error: { type: "upstream_error", message: `Upstream ${resp.status}: ${errText}` } }, { status: 502 });
      } else {
        circuit.recordSuccess();
      }
    } catch (err: any) {
      circuit.recordFailure();
      console.warn(`[fetch] ${provider} error:`, err?.name, err?.message, err?.cause || "");
      if (complexity) recordFailure(effectiveModel, complexity.tier, complexity.language, fetchLatency);
      resp = null;
    }
  }

  // Fallback: try remaining candidates (cross-provider ordered list)
  if (!resp) {
    // Find the primary's index and try each remaining candidate
    const primaryIdx = allCandidates.indexOf(modelSlug);
    for (let fi = primaryIdx + 1; fi < allCandidates.length; fi++) {
      const fbKey = keyResults[fi];
      if (!fbKey) continue;
      const fbSlug = allCandidates[fi];
      const fbAdapter = getAdapter(fbSlug);
      if (fbAdapter) {
        let fbApiKey: string;
        try { fbApiKey = decrypt(fbKey.keyEncrypted); } catch { fbApiKey = ""; }
        if (fbApiKey) {
          const fbBuilt = fbAdapter.buildRequest({
            model: fbSlug.split("/")[1],
            messages: finalMessages,
            temperature: body.temperature,
            max_tokens: body.max_tokens,
            top_p: body.top_p,
            stop: body.stop_sequences || body.stop,
            stream: isStreaming,
            tools: body.tools,
            tool_choice: body.tool_choice,
          }, fbApiKey);

          try {
            const fetchFn2 = fbBuilt.dispatcher ? (await import("undici")).fetch : fetch;
            resp = await fetchFn2(fbBuilt.url, {
              method: "POST", headers: fbBuilt.headers,
              body: JSON.stringify(fbBuilt.body),
              ...(fbBuilt.dispatcher ? { dispatcher: fbBuilt.dispatcher } : {}),
            }) as Response;
            usedFallback = true;
            fallbackProvider = fbSlug.split("/")[0];
            routeReason += ` -> fallback:${fallbackProvider}`;
            break; // found a working candidate
          } catch (e2: any) {
            console.warn(`[fetch] fallback ${fbSlug} failed:`, e2?.name || e2?.message);
          }
        }
      }
    }
  }

  if (!resp) {
    return Response.json({ type: "error", error: { type: "capacity_error", message: "All providers unavailable" } }, { status: 503 });
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "").then(t => t.slice(0, 500));
    return Response.json({ type: "error", error: { type: "upstream_error", message: `Upstream ${resp.status}: ${errText}` } }, { status: 502 });
  }

  // Update effective provider/model for response when fallback was used
  if (usedFallback && fallbackProvider) {
    // Find the actual slug of the fallback candidate
    const fbSlug = allCandidates.find(c => c.startsWith(fallbackProvider + "/")) || `${fallbackProvider}/${fallbackProvider}-default`;
    effectiveModel = fbSlug;
    provider = fallbackProvider;
    adapter = getAdapter(fbSlug)!;
  }

  // --- Route transparency headers ---
  const routeHeaders: Record<string, string> = {
    "X-Route-Reason": routeReason,
    "X-Effective-Model": effectiveModel,
  };
  if (rateLimitRemaining) {
    routeHeaders["X-RateLimit-Remaining"] = rateLimitRemaining;
    routeHeaders["X-RateLimit-Limit"] = rateLimitTotal!;
    routeHeaders["X-RateLimit-Reset"] = rateLimitReset!;
  }
  // Cost transparency: show what the smart routing chose and how much was saved
  if (costTier) {
    const savings = costSavings(effectiveModel, userMessage?.length || 0);
    routeHeaders["X-Cost-Tier"] = costTier;
    routeHeaders["X-Cost-Saved"] = `¥${savings.saved}`;
  }

  try {
    if (isStreaming) {
      if (provider === "anthropic") {
        // Bridge undici → native ReadableStream for safe pass-through
        const upstreamBody = resp.body!;
        const reader = upstreamBody.getReader();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) { controller.close(); return; }
                controller.enqueue(value);
              }
            } catch (err) {
              controller.error(err);
            }
          },
          cancel() {
            reader.cancel().catch(() => {});
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...routeHeaders },
        });
      }
      return streamAnthropicSSE(resp, auth, selectedKey, effectiveModel, provider, routeReason, openaiMessages);
    }

    const data = await resp.json();
    const usage = adapter.extractUsage(data);

    // For Anthropic: preserve native content blocks (tool_use, thinking, etc.)
    const isAnthropicProvider = provider === "anthropic";
    const assistantContent = isAnthropicProvider
      ? (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
      : (adapter.parseResponse(data).choices?.[0]?.message?.content || "");

    // Billing + Metrics (skip for passthrough)
    if (selectedKey && !auth.isPassthrough) {
      recordUsage({ userId: auth.userId, apiKeyId: auth.apiKeyId, providerKeyId: selectedKey.id, modelSlug: effectiveModel, provider, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, routeReason, isStreaming: false, durationMs: 0 }).catch(() => {});
    }
    // Record quality signal for self-evolving routing
    if (complexity) {
      recordSuccess(effectiveModel, complexity.tier, complexity.language, fetchLatency, usage.completion_tokens || 0, assistantContent.length);
    }
    // Debug trace: record this request for the debug panel
    addTrace({
      model: body.model || "auto",
      routeReason,
      effectiveModel,
      status: resp && resp.ok ? "ok" : "failed",
      latencyMs: fetchLatency,
      tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    });

    // Memory
    const conv = await createConversation(auth.userId).catch(() => null);
    if (conv && assistantContent) {
      saveMessages({ conversationId: conv.id, messages: [...openaiMessages, { role: "assistant", content: assistantContent }], provider, modelSlug: effectiveModel }).catch(() => {});
      createMemoryFragments({ userId: auth.userId, conversationId: conv.id, messages: openaiMessages, responseContent: assistantContent, modelSlug: effectiveModel }).catch(() => {});
    }

    // Model name for response: use user's requested name when no fallback occurred
    const userModel = body.model || "";
    const responseModel = routeReason === "manual"
      ? (userModel.includes("/") ? userModel.split("/")[1] : userModel)
      : (effectiveModel.includes("/") ? effectiveModel.split("/")[1] : effectiveModel);

    if (isAnthropicProvider) {
      // Return native Anthropic response — preserves tool_use blocks, thinking, etc.
      return Response.json({ ...data, model: responseModel }, { headers: routeHeaders });
    }

    const parsed = adapter.parseResponse(data);
    // Build Anthropic content blocks from OpenAI response
    const contentBlocks: any[] = [];
    // Add text block if there's content
    if (assistantContent) {
      contentBlocks.push({ type: "text", text: assistantContent });
    }
    // Convert OpenAI tool_calls → Anthropic tool_use blocks
    const toolCalls = parsed.choices?.[0]?.message?.tool_calls;
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const tcFn = tc.function || {};
        let input = {};
        try { input = typeof tcFn.arguments === "string" ? JSON.parse(tcFn.arguments) : (tcFn.arguments || {}); } catch { input = {}; }
        contentBlocks.push({ type: "tool_use", id: tc.id || `toolu_${Date.now()}`, name: tcFn.name || "", input });
      }
    }
    const stopReason = parsed.choices?.[0]?.finish_reason;
    return Response.json({
      id: `msg_${parsed.id || Date.now()}`,
      type: "message",
      role: "assistant",
      content: contentBlocks.length > 0 ? contentBlocks : [{ type: "text", text: "" }],
      model: responseModel,
      stop_reason: toolCalls?.length > 0 ? "tool_use" : (stopReason === "stop" ? "end_turn" : "max_tokens"),
      stop_sequence: null,
      usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens },
    }, { headers: routeHeaders });
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
                  const streamModel = modelSlug.includes("/") ? modelSlug.split("/")[1] : modelSlug;
                  enqueue(`event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"${streamModel}\",\"usage\":null}}\n\n`);
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
        // Send stop events (guarded: fire at most once)
        if (!stopped) {
          stopped = true;
          if (contentBlockStarted) {
            enqueue("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
          }
          const stopReason = "end_turn";
          enqueue(`event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"${stopReason}\"},\"usage\":{\"input_tokens\":${lastUsage?.prompt_tokens || 0},\"output_tokens\":${lastUsage?.completion_tokens || Math.ceil(fullContent.length / 3)}}}\n\n`);
          enqueue("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
          controller.close();
        }

        // Billing + memory (fire-and-forget)
        const tokens = lastUsage || { prompt_tokens: 0, completion_tokens: Math.ceil(fullContent.length / 3) };
        if (selectedKey && !auth.isPassthrough) {
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Route-Reason": routeReason, "X-Effective-Model": modelSlug },
  });
}
