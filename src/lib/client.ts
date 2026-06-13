/**
 * Memory OS client — pure TypeScript bridge to the Memory OS stack.
 *
 * Connects directly to:
 *   - Qdrant (REST API) for search + health
 *   - llama.cpp (OpenAI-compatible) for embeddings
 *   - Redis for ARQ-compatible job enqueue (store, reflect)
 *
 * Prerequisite: Memory OS Docker stack (Qdrant + Redis + ARQ worker) running locally.
 */

import { Redis } from "ioredis";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import { randomUUID } from "node:crypto";

// ────────────────────────────────────────────
// Config
// ────────────────────────────────────────────

interface MemoryOSConfig {
  qdrantUrl: string;
  collection: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string | null;
  embeddingApiBase: string;
  embeddingModel: string;
  embeddingDims: number;
  source: string;
  llmApiBase: string;
}

function loadConfig(): MemoryOSConfig {
  return {
    qdrantUrl: envStr("MEMORY_OS_QDRANT_URL", "http://127.0.0.1:6333"),
    collection: envStr("MEMORY_OS_COLLECTION", "knowledge_base"),
    redisHost: envStr("MEMORY_OS_REDIS_HOST", "127.0.0.1"),
    redisPort: envInt("MEMORY_OS_REDIS_PORT", 6379),
    redisPassword: envStr("MEMORY_OS_REDIS_PASSWORD", ""),
    embeddingApiBase: envStr("MEMORY_OS_EMBEDDING_API_BASE", "http://127.0.0.1:7485/v1"),
    embeddingModel: envStr("MEMORY_OS_EMBEDDING_MODEL", "qwen3-embed-0.6b"),
    embeddingDims: envInt("MEMORY_OS_EMBEDDING_DIMS", 1024),
    source: envStr("MEMORY_OS_SOURCE", "pi-coding-agent"),
    llmApiBase: envStr("MEMORY_OS_LLM_API_BASE", "http://127.0.0.1:7486/v1"),
  };
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) || fallback : fallback;
}

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface StatusResult {
  ok: boolean;
  checks: {
    qdrant: ProbeResult;
    redis: ProbeResult;
    embeddings: ProbeResult;
    llmBridge: ProbeResult;
  };
  config: Record<string, string>;
}

export interface ProbeResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface SearchHit {
  id: string;
  score: number | null;
  text: string | null;
  source: string | null;
  tags: string[];
  createdAt: string | null;
}

export interface SearchResult {
  ok: boolean;
  count: number;
  results: SearchHit[];
}

export interface StoreResult {
  ok: boolean;
  jobId?: string;
  function?: string;
  error?: string;
}

export interface ReflectResult {
  ok: boolean;
  jobId?: string;
  function?: string;
  error?: string;
}

// ────────────────────────────────────────────
// Qdrant API types
// ────────────────────────────────────────────

interface QdrantSearchResponse {
  result?: QdrantPoint[];
}

interface QdrantPoint {
  id: string | number;
  version: number;
  score: number;
  payload: Record<string, unknown> | null;
}

// ────────────────────────────────────────────
// Memory OS Client
// ────────────────────────────────────────────

export class MemoryOSClient {
  private cfg: MemoryOSConfig;

  constructor(config?: Partial<MemoryOSConfig>) {
    this.cfg = { ...loadConfig(), ...config };
  }

  // ── Embedding ──

  private async embed(text: string): Promise<number[]> {
    const url = `${this.cfg.embeddingApiBase.replace(/\/+$/, "")}/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.cfg.embeddingModel,
        input: text,
      }),
      signal: AbortSignal.timeout(30_000),
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
    return vec.map(Number);
  }

  // ── Qdrant helpers ──

  private qdrantUrl(path: string): string {
    return `${this.cfg.qdrantUrl.replace(/\/+$/, "")}${path}`;
  }

  private async qdrantProbe(): Promise<ProbeResult> {
    try {
      const resp = await fetch(this.qdrantUrl("/collections"), {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) {
        return { ok: false, statusCode: resp.status, error: await resp.text() };
      }
      const data: unknown = await resp.json();
      const cols =
        (data as Record<string, unknown>)["result"] as Record<string, unknown> | undefined;
      const list = cols?.["collections"] as Array<{ name: string }> | undefined;
      const names = (list ?? []).map((c) => c.name);
      return {
        ok: true,
        statusCode: resp.status,
        collections: names,
        hasOurCollection: names.includes(this.cfg.collection),
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  private async qdrantSearch(
    vector: number[],
    limit: number,
  ): Promise<QdrantPoint[]> {
    // Use the classic search endpoint (works with Qdrant v1.0+)
    const resp = await fetch(this.qdrantUrl(`/collections/${encodeURIComponent(this.cfg.collection)}/points/search`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: { name: "dense", vector },
        limit,
        with_payload: true,
        with_vector: false,
      } satisfies {
        vector: { name: string; vector: number[] };
        limit: number;
        with_payload: boolean;
        with_vector: boolean;
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      throw new Error(`Qdrant search HTTP ${resp.status}: ${await resp.text()}`);
    }
    const data: QdrantSearchResponse = await resp.json();
    return data.result ?? [];
  }

  // ── Redis / ARQ helpers ──

  private createRedis(): Redis {
    const { redisHost, redisPort, redisPassword } = this.cfg;
    return new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // don't retry on connect failure
      lazyConnect: true,
    });
  }

  /**
   * Enqueue an ARQ-compatible job via Redis.
   *
   * Matches arq 0.28+ job serialization format:
   *   - HSET arq:job:<jobId>  (hash with job_id, function, msgpacked args/kwargs, …)
   *   - ZADD arq:queue <score> <jobId>
   *
   * @see https://github.com/encode/arq (Python library)
   */
  private async enqueueArqJob(
    functionName: string,
    args: unknown[],
  ): Promise<StoreResult | ReflectResult> {
    const redis = this.createRedis();
    try {
      await redis.connect();

      const jobId = randomUUID();
      const now = Date.now() / 1000;
      const queueName = "arq:queue";
      const jobKeyPrefix = "arq:job:";

      const argBytes = msgpackEncode(args);
      const kwargsBytes = msgpackEncode({});

      await redis.hset(
        `${jobKeyPrefix}${jobId}`,
        "job_id", jobId,
        "function", functionName,
        "args", Buffer.from(argBytes),
        "kwargs", Buffer.from(kwargsBytes),
        "result", "",
        "success", "",
        "created_at", String(now),
        "enqueue_time", String(now),
        "queue_name", queueName,
        "score", "0",
      );

      await redis.zadd(queueName, 0, jobId);

      return { ok: true, jobId, function: functionName };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      await redis.quit().catch(() => {});
    }
  }

  // ── Public API ──

  async status(): Promise<StatusResult> {
    const [qdrant, redis, embeddings, llmBridge] = await Promise.all([
      this.qdrantProbe(),
      this.probeRedis(),
      this.httpProbe(`${this.cfg.embeddingApiBase.replace(/\/+$/, "")}/models`),
      this.httpProbe(`${this.cfg.llmApiBase.replace(/\/+$/, "")}/models`),
    ]);

    const allOk = qdrant.ok && redis.ok && embeddings.ok && llmBridge.ok;

    return {
      ok: allOk,
      checks: { qdrant, redis, embeddings, llmBridge },
      config: {
        qdrantUrl: this.cfg.qdrantUrl,
        collection: this.cfg.collection,
        redisHost: this.cfg.redisHost,
        redisPort: String(this.cfg.redisPort),
        embeddingApiBase: this.cfg.embeddingApiBase,
        embeddingModel: this.cfg.embeddingModel,
        embeddingDims: String(this.cfg.embeddingDims),
        source: this.cfg.source,
      },
    };
  }

  async search(query: string, limit = 5, tags?: string[]): Promise<SearchResult> {
    if (!query.trim()) {
      return { ok: false, count: 0, results: [] };
    }

    try {
      const vector = await this.embed(query);
      const points = await this.qdrantSearch(vector, limit);

      let results: SearchHit[] = points.map((p) => ({
        id: String(p.id),
        score: p.score ?? null,
        text: (p.payload?.text as string) ?? null,
        source: (p.payload?.source as string) ?? null,
        tags: ((p.payload?.tags as string[]) ?? []) as string[],
        createdAt: (p.payload?.created_at as string) ?? null,
      }));

      // Apply optional tag filter in-memory (matches Python adapter behaviour)
      if (tags && tags.length > 0) {
        const wanted = new Set(tags);
        results = results.filter((r) => r.tags.some((t) => wanted.has(t)));
      }

      return { ok: true, count: results.length, results };
    } catch (err) {
      return { ok: false, count: 0, results: [] };
    }
  }

  async store(
    text: string,
    source?: string,
    tags?: string[],
  ): Promise<StoreResult> {
    if (!text.trim()) {
      return { ok: false, error: "text must not be empty" };
    }
    return this.enqueueArqJob("process_ingestion", [
      text,
      source ?? this.cfg.source,
      tags ?? [],
    ]);
  }

  async reflect(): Promise<ReflectResult> {
    return this.enqueueArqJob("process_reflection", []);
  }

  // ── Probes ──

  private async probeRedis(): Promise<ProbeResult> {
    const redis = this.createRedis();
    try {
      await redis.connect();
      const pong = await redis.ping();
      return { ok: pong === "PONG", host: this.cfg.redisHost, port: this.cfg.redisPort };
    } catch (err) {
      return { ok: false, host: this.cfg.redisHost, port: this.cfg.redisPort, error: String(err) };
    } finally {
      await redis.quit().catch(() => {});
    }
  }

  private async httpProbe(url: string): Promise<ProbeResult> {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return { ok: resp.ok, statusCode: resp.status, url };
    } catch (err) {
      return { ok: false, url, error: String(err) };
    }
  }
}
