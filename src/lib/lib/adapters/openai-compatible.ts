import type { Adapter, StandardRequest, StandardResponse } from "./types";

/**
 * Base adapter for any provider with an OpenAI-compatible API.
 * DeepSeek, Qwen, GLM, Moonshot, etc. all use an OpenAI-compatible format.
 */
import { ProxyAgent } from "undici";

export function createOpenAICompatibleAdapter(
  provider: string,
  baseUrl: string,
  defaultModel: string,
  proxyUrl?: string,
): Adapter {
  const dispatcher = proxyUrl
    ? new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } })
    : undefined;

  return {
    provider,

    buildRequest(req: StandardRequest, apiKey: string) {
      return {
        url: `${baseUrl}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model: req.model || defaultModel,
          messages: req.messages,
          temperature: req.temperature,
          max_tokens: req.max_tokens || 256, // V4 models need higher minimum
          top_p: req.top_p,
          stop: req.stop,
          stream: req.stream ?? false,
          ...(req.tools ? { tools: req.tools } : {}),
          ...(req.tool_choice ? { tool_choice: req.tool_choice } : {}),
        },
        dispatcher,
      };
    },

    parseResponse(data: any): StandardResponse {
      // These providers return OpenAI-compatible responses, so minimal translation needed
      return {
        id: data.id || `chatcmpl-${Date.now()}`,
        object: data.object || "chat.completion",
        created: data.created || Math.floor(Date.now() / 1000),
        model: data.model || "",
        choices: (data.choices || []).map((c: any, i: number) => ({
          index: c.index ?? i,
          message: {
            role: c.message?.role || "assistant",
            content: c.message?.content || "",
            ...(c.message?.tool_calls ? { tool_calls: c.message.tool_calls } : {}),
          },
          finish_reason: c.finish_reason || "stop",
        })),
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens || 0,
              completion_tokens: data.usage.completion_tokens || 0,
              total_tokens: data.usage.total_tokens || 0,
            }
          : undefined,
      };
    },

    extractUsage(data: any) {
      return {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
      };
    },
  };
}
