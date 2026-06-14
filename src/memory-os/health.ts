import { embedText } from "./embedding-client.js";
import { probeQdrant } from "./qdrant-client.js";
import { closeRedis, createRedisClient } from "./redis-arq-client.js";
import type { MemoryOSConfig, ProbeResult, HealthResult } from "../types.js";

export interface HealthDeps {
  probeQdrant: (url: string, collection: string) => Promise<ProbeResult>;
  pingRedis: (host: string, port: number, password: string | null) => Promise<ProbeResult>;
  probeEmbeddings: (apiBase: string, model: string, dims?: number) => Promise<ProbeResult>;
}

const defaultDeps: HealthDeps = {
  probeQdrant,
  pingRedis: async (host, port, password): Promise<ProbeResult> => {
    const redis = createRedisClient({
      qdrantUrl: "",
      collection: "",
      redisHost: host,
      redisPort: port,
      redisPassword: password,
      embeddingApiBase: "",
      embeddingModel: "",
      embeddingDims: 0,
      source: "",
      minScore: 0,
      maxResults: 0,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: false,
      captureEnabled: false,
    });
    let lastRedisError: Error | null = null;
    redis.on("error", (err) => {
      lastRedisError = err;
    });
    let connected = false;
    try {
      await redis.connect();
      connected = true;
      const pong = await redis.ping();
      return { ok: pong === "PONG" };
    } catch (err) {
      const error = lastRedisError ?? err;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await closeRedis(redis, connected);
    }
  },
  probeEmbeddings: async (apiBase, model, dims): Promise<ProbeResult> => {
    try {
      await embedText("health", { apiBase, model, dims, timeoutMs: 3000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export async function checkHealth(
  config: MemoryOSConfig,
  deps: HealthDeps = defaultDeps,
): Promise<HealthResult> {
  const checks: Record<string, ProbeResult> = {};

  checks.qdrant = await safeProbe(async () => deps.probeQdrant(config.qdrantUrl, config.collection));
  checks.redis = await safeProbe(async () => deps.pingRedis(config.redisHost, config.redisPort, config.redisPassword));
  checks.embeddings = await safeProbe(async () => deps.probeEmbeddings(config.embeddingApiBase, config.embeddingModel, config.embeddingDims));

  const ok = Object.values(checks).every((c) => c.ok);

  return { ok, checks };
}

async function safeProbe(fn: () => Promise<ProbeResult>): Promise<ProbeResult> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
