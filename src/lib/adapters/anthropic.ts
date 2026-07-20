import type { Adapter, StandardRequest, StandardResponse } from "./types";
import { ProxyAgent } from "undici";

const ANTHROPIC_PROXY = process.env.ANTHROPIC_PROXY || "http://127.0.0.1:7897";

const dispatcher = ANTHROPIC_PROXY
  ? new ProxyAgent({ uri: ANTHROPIC_PROXY, requestTls: { rejectUnauthorized: false } })
  : undefined;

export const anthropicAdapter: Adapter = {
  provider: "anthropic",

  buildRequest(req: StandardRequest, apiKey: string) {
    const systemMessage = req.messages.find((m) => m.role === "system");
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m: any) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: req.max_tokens || 4096,
    };

    if (systemMessage) body.system = systemMessage.content;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (req.stop) body.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
    if (req.stream) body.stream = true;

    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
      dispatcher, // proxy support
    };
  },

  parseResponse(data: any): StandardResponse {
    const content = data.content || [];
    const textBlock = content.find((b: any) => b.type === "text");

    return {
      id: data.id || `msg_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: data.model || "",
      choices: [
        {
          index: 0,
          message: {
            role: data.role || "assistant",
            content: textBlock?.text || "",
          },
          finish_reason: data.stop_reason || "stop",
        },
      ],
      usage: data.usage
        ? {
            prompt_tokens: data.usage.input_tokens || 0,
            completion_tokens: data.usage.output_tokens || 0,
            total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
        : undefined,
    };
  },

  extractUsage(data: any) {
    return {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
    };
  },
};
