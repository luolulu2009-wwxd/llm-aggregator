/**
 * Embedding service — local BGE-small-zh (512 dims).
 * Calls the local Python embedding server on http://127.0.0.1:9999.
 */
const EMBEDDING_URL = process.env.EMBEDDING_SERVER_URL || "http://127.0.0.1:9999/embeddings";
const EMBEDDING_DIM = 512;

interface EmbeddingResult {
  embedding: number[];
  tokensUsed: number;
}

// In-memory cache for query embeddings
const queryCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function generateEmbedding(
  text: string,
  _apiKey?: string,
  _provider?: string,
): Promise<EmbeddingResult> {
  const results = await generateEmbeddings([text]);
  return results[0];
}

export async function generateEmbeddings(
  texts: string[],
  _apiKey?: string,
  _provider?: string,
): Promise<EmbeddingResult[]> {
  const response = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Embedding server ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const totalTokens = data.usage?.total_tokens || 0;

  return data.data.map((item: any, i: number) => ({
    embedding: item.embedding,
    tokensUsed: Math.floor(totalTokens / texts.length),
  }));
}

export async function getQueryEmbedding(
  text: string,
  _apiKey?: string,
  _provider?: string,
): Promise<number[]> {
  const cached = queryCache.get(text);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.embedding;
  }

  const result = await generateEmbedding(text);
  queryCache.set(text, { embedding: result.embedding, ts: Date.now() });

  if (queryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of queryCache) {
      if (now - v.ts > CACHE_TTL) queryCache.delete(k);
    }
  }

  return result.embedding;
}

export { EMBEDDING_DIM };
