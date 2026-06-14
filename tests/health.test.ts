import { describe, expect, it } from "vitest";
import { checkHealth } from "../src/memory-os/health.js";
import type { HealthDeps } from "../src/memory-os/health.js";
import type { MemoryOSConfig, ProbeResult } from "../src/types.js";

const baseConfig: MemoryOSConfig = {
  qdrantUrl: "http://127.0.0.1:6333",
  collection: "knowledge_base",
  redisHost: "127.0.0.1",
  redisPort: 6379,
  redisPassword: null,
  embeddingApiBase: "http://127.0.0.1:7485/v1",
  embeddingModel: "qwen3-embed-0.6b",
  embeddingDims: 1024,
  source: "pi-coding-agent",
  minScore: 0.35,
  maxResults: 3,
  injectionEnabled: true,
  captureEnabled: true,
};

describe("checkHealth", () => {
  it("returns ok true when all probes succeed", async () => {
    const deps: HealthDeps = {
      probeQdrant: async () => ({ ok: true, statusCode: 200 }),
      pingRedis: async () => ({ ok: true }),
      probeEmbeddings: async () => ({ ok: true }),
    };

    const result = await checkHealth(baseConfig, deps);

    expect(result.ok).toBe(true);
    expect(result.checks.qdrant.ok).toBe(true);
    expect(result.checks.redis.ok).toBe(true);
    expect(result.checks.embeddings.ok).toBe(true);
  });

  it("returns ok false when any probe fails", async () => {
    const deps: HealthDeps = {
      probeQdrant: async () => ({ ok: true, statusCode: 200 }),
      pingRedis: async () => ({ ok: false, error: "connection refused" }),
      probeEmbeddings: async () => ({ ok: true }),
    };

    const result = await checkHealth(baseConfig, deps);

    expect(result.ok).toBe(false);
    expect(result.checks.redis.ok).toBe(false);
    expect(result.checks.redis.error).toBe("connection refused");
  });

  it("includes all failures when multiple probes fail", async () => {
    const deps: HealthDeps = {
      probeQdrant: async () => ({ ok: false, error: "qdrant down" }),
      pingRedis: async () => ({ ok: false, error: "redis down" }),
      probeEmbeddings: async () => ({ ok: false, error: "embeddings down" }),
    };

    const result = await checkHealth(baseConfig, deps);

    expect(result.ok).toBe(false);
    expect(result.checks.qdrant.error).toBe("qdrant down");
    expect(result.checks.redis.error).toBe("redis down");
    expect(result.checks.embeddings.error).toBe("embeddings down");
  });

  it("does not throw when a probe throws", async () => {
    const deps: HealthDeps = {
      probeQdrant: async () => ({ ok: true }),
      pingRedis: async () => { throw new Error("unexpected panic"); },
      probeEmbeddings: async () => ({ ok: true }),
    };

    const result = await checkHealth(baseConfig, deps);

    expect(result.ok).toBe(false);
    expect(result.checks.redis.ok).toBe(false);
    expect(result.checks.redis.error).toContain("unexpected panic");
  });

  it("uses default probes when deps not provided", async () => {
    // Just verify it doesn't throw immediately — real probes will fail
    // without services running, but the function should handle that gracefully.
    const result = await checkHealth(baseConfig);

    // Without real services, probes will fail, but checkHealth should never throw
    expect(typeof result.ok).toBe("boolean");
    expect(result.checks).toHaveProperty("qdrant");
    expect(result.checks).toHaveProperty("redis");
    expect(result.checks).toHaveProperty("embeddings");
  });
});
