/** OpenAI-compatible request (our internal standard format) */
export interface StandardRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
}

/** OpenAI-compatible response (our internal standard format) */
export interface StandardResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Adapter {
  /** Provider identifier */
  provider: string;

  /** Translate our standard request into the provider's native request format */
  buildRequest(req: StandardRequest, apiKey: string): { url: string; headers: Record<string, string>; body: unknown; dispatcher?: any };

  /** Translate the provider's native response into our standard format */
  parseResponse(data: unknown): StandardResponse;

  /** Extract usage from provider response (streaming and non-streaming) */
  extractUsage(data: unknown): { prompt_tokens: number; completion_tokens: number };
}
