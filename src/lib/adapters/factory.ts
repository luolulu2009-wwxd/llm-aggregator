import type { Adapter } from "./types";
import { createOpenAICompatibleAdapter } from "./openai-compatible";
import { anthropicAdapter } from "./anthropic";

const adapters = new Map<string, Adapter>();

// Register adapters on startup
function register(adapter: Adapter) {
  adapters.set(adapter.provider, adapter);
}

// OpenAI-compatible providers — all use the same adapter pattern with different base URLs
register(createOpenAICompatibleAdapter("deepseek", "https://api.deepseek.com/v1", "deepseek-chat"));
register(createOpenAICompatibleAdapter("qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus"));
register(createOpenAICompatibleAdapter("glm", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"));
register(createOpenAICompatibleAdapter("moonshot", "https://api.moonshot.cn/v1", "moonshot-v1-8k"));
// OpenAI needs proxy (geo-blocked from HK, same as Anthropic)
const externalProxy = process.env.ANTHROPIC_PROXY || undefined;
register(createOpenAICompatibleAdapter("openai", "https://api.openai.com/v1", "gpt-4o", externalProxy));

// Anthropic uses a different native format
register(anthropicAdapter);

/**
 * Get an adapter by provider name.
 * "deepseek/deepseek-chat" → look up "deepseek" adapter
 */
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
