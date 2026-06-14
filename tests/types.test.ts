import { describe, expect, it } from "vitest";
import type { MemoryHit, MemoryOSConfig } from "../src/types.js";

describe("types", () => {
  it("allows the minimum memory hit shape used by injection", () => {
    const hit: MemoryHit = {
      id: "abc",
      score: 0.7,
      text: "Remember this.",
      source: "qdrant",
      tags: ["project"],
      createdAt: "2026-06-13T00:00:00Z",
    };

    expect(hit.id).toBe("abc");
  });

  it("allows the minimum config shape used by service clients", () => {
    const config: MemoryOSConfig = {
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
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
    };

    expect(config.maxResults).toBe(3);
  });
});
