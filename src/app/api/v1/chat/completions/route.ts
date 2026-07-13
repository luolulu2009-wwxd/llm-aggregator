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
import { detectSelfDealing, checkEarningsAnomaly } from "@/lib/abuse";

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

  // --- Model Selection (#8 + #9) ---
  let modelSlug: string;
  let routeReason: string;

  if (body.model && body.model !== "auto") {
    // Manual — user specified a model
    modelSlug = body.model;
    routeReason = "manual";
  } else {
    // Auto — use rule engine
    const userMessage = body.messages?.find((m: any) => m.role === "user")?.content || "";
    const classification = await classifyPrompt(userMessage);
    if (classification) {
      modelSlug = classification.targetModel;
      routeReason = `rule:${classification.intent}`;
    } else {
      modelSlug = DEFAULT_MODEL;
      routeReason = "rule:default";
    }
  }

  // --- Provider selection from Key Pool (#6) ---
  const provider = modelSlug.split("/")[0];
  const modelName = modelSlug.split("/")[1];
  const modelsFallback = body.models || []; // user-configured fallback chain

  let selectedKey = await selectBestKey(provider, modelName);
  let effectiveModel = modelSlug;

  // --- Fallback: try alternative models from the `models` array (#10) ---
  if (!selectedKey && modelsFallback.length > 0) {
    for (const fallbackModel of modelsFallback) {
      const fbProvider = fallbackModel.split("/")[0];
      const fbModel = fallbackModel.split("/")[1];
      const fbKey = await selectBestKey(fbProvider, fbModel);
      if (fbKey) {
        selectedKey = fbKey;
        effectiveModel = fallbackModel;
        routeReason += ` → fallback:model`;
        break;
      }
    }
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
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      stop: body.stop,
      stream: isStreaming ?? false,
    },
    providerApiKey,
  );
  const { url, headers, body: nativeBody, dispatcher } = built;

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
            return isStreaming ? streamResponse(retryResp) : jsonResponse(retryResp, adapter!, auth, selectedKey?.id, effectiveModel, provider, routeReason);
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
              return isStreaming ? streamResponse(fbResp) : jsonResponse(fbResp, fbAdapter, auth, fbKey.id, fallbackModel, fbProvider, routeReason);
            }
          }
        }
      }
    }

    if (!response.ok) {
      return errorResponse(response.status);
    }

    if (isStreaming) {
      return streamResponse(response);
    }

    return jsonResponse(response, adapter, auth, selectedKey?.id, effectiveModel, provider, routeReason);
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

async function jsonResponse(response: Response, adapter: ReturnType<typeof getAdapter>, auth: { userId: string; apiKeyId: string }, keyId: string | undefined, modelSlug: string, provider: string, routeReason: string) {
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

  const standard = adapter!.parseResponse(data);
  return Response.json(standard);
}

function streamResponse(response: Response) {
  return new Response(response.body, {
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
