export interface EmbeddingOptions {
  apiBase: string;
  model: string;
  dims?: number;
  timeoutMs: number;
}

const EMBEDDING_CACHE = new Map<string, number[]>();
const MAX_CACHE_SIZE = 256;

function cacheGet(key: string): number[] | undefined {
  if (!EMBEDDING_CACHE.has(key)) return undefined;
  // Move to end (most recently used)
  const val = EMBEDDING_CACHE.get(key)!;
  EMBEDDING_CACHE.delete(key);
  EMBEDDING_CACHE.set(key, val);
  return val;
}

function cacheSet(key: string, val: number[]): void {
  if (EMBEDDING_CACHE.has(key)) {
    EMBEDDING_CACHE.delete(key);
  } else if (EMBEDDING_CACHE.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first entry)
    const oldest = EMBEDDING_CACHE.keys().next().value as string;
    EMBEDDING_CACHE.delete(oldest);
  }
  EMBEDDING_CACHE.set(key, val);
}

/** Clear the embedding cache. Exposed for testing. */
export function clearEmbeddingCache(): void {
  EMBEDDING_CACHE.clear();
}

export async function embedText(text: string, options: EmbeddingOptions): Promise<number[]> {
  const cacheKey = `${options.apiBase}\0${options.model}\0${options.dims ?? ""}\0${text}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `${options.apiBase.replace(/\/+$/, "")}/embeddings`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      input: text,
      ...(options.dims !== undefined ? { dimensions: options.dims } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`embedding HTTP ${response.status}: ${await response.text()}`);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("embedding: invalid response");
  const arr = (data as Record<string, unknown>)["data"];
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("embedding: empty data array");
  const vec = (arr[0] as Record<string, unknown>)["embedding"];
  if (!Array.isArray(vec)) throw new Error("embedding: missing embedding vector");
  const result = vec.map(Number);
  if (options.dims !== undefined && result.length !== options.dims) {
    throw new Error(`embedding: expected ${options.dims} dimensions, got ${result.length}`);
  }
  cacheSet(cacheKey, result);
  return result;
}
