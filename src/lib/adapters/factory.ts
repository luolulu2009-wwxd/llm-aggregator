import type { Adapter } from "./types";
import { createOpenAICompatibleAdapter } from "./openai-compatible";
import { anthropicAdapter } from "./anthropic";
import { ProxyAgent } from "undici";

const adapters = new Map<string, Adapter>();

function register(adapter: Adapter) {
  adapters.set(adapter.provider, adapter);
}

// External proxy for geo-blocked providers (Anthropic, OpenAI)
const externalProxy = process.env.ANTHROPIC_PROXY || undefined;

// ── OpenAI-compatible providers ──
register(createOpenAICompatibleAdapter("deepseek", "https://api.deepseek.com/v1", "deepseek-chat"));
register(createOpenAICompatibleAdapter("qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus"));
register(createOpenAICompatibleAdapter("glm", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"));
register(createOpenAICompatibleAdapter("moonshot", "https://api.moonshot.cn/v1", "moonshot-v1-8k"));
register(createOpenAICompatibleAdapter("openai", "https://api.openai.com/v1", "gpt-4o", externalProxy));
register(createOpenAICompatibleAdapter("doubao", "https://ark.cn-beijing.volces.com/api/v3", "doubao-pro-32k"));

// ── Anthropic (native format + proxy) ──
register(anthropicAdapter);

// ── OpenRouter via local HTTP proxy → SSH tunnel → BandwagonHost → OpenRouter ──
// Proxy: node /root/or-proxy.js listens on :3001, forwards HTTP→HTTPS through SSH tunnel
const OR_PROXY = process.env.OPENROUTER_PROXY || "";  // http://127.0.0.1:3001
const orBaseUrl = OR_PROXY ? `${OR_PROXY}/api/v1` : "https://openrouter.ai/api/v1";

const openRouterAdapter = createOpenAICompatibleAdapter("openrouter", orBaseUrl, "anthropic/claude-sonnet-5");
const orBuild = openRouterAdapter.buildRequest;
openRouterAdapter.buildRequest = (req, apiKey) => {
  const modelMap: Record<string, string> = {
    "claude-sonnet-5": "anthropic/claude-sonnet-5",
    "claude-opus-4-8": "anthropic/claude-opus-4-8",
    "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
    "claude-fable-5": "anthropic/claude-fable-5",
    "gpt-5": "openai/gpt-5",
    "gpt-4o": "openai/gpt-4o",
  };
  return orBuild({ ...req, model: modelMap[req.model] || req.model }, apiKey);
};
register(openRouterAdapter);

// ── Public API ──

export function getAdapter(modelSlug: string): Adapter | null {
  const provider = modelSlug.split("/")[0];
  return adapters.get(provider) || null;
}

export function getAdapterByProvider(provider: string): Adapter | null {
  return adapters.get(provider) || null;
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}
