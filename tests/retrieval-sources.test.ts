import { describe, expect, it, vi } from "vitest";

const { recallMock, queryQdrantMock, embedTextMock, embedSparseTextMock } = vi.hoisted(() => ({
  recallMock: vi.fn(),
  queryQdrantMock: vi.fn(),
  embedTextMock: vi.fn(),
  embedSparseTextMock: vi.fn(),
}));

vi.mock("pi-fabric", () => ({
  loadConfig: () => ({ fabricDir: "/tmp/fabric", agent: "tester", projectId: "project", compatMode: "icarus", autoStore: true }),
  FabricStore: class FabricStore {
    config: unknown;
    constructor(config: unknown) { this.config = config; }
  },
  recall: recallMock,
}));
vi.mock("../src/memory-os/embedding-client.js", () => ({ embedText: embedTextMock }));
vi.mock("../src/memory-os/qdrant-client.js", () => ({ queryQdrant: queryQdrantMock }));
vi.mock("../src/memory-os/sparse-embedding-client.js", () => ({ embedSparseText: embedSparseTextMock }));

import { createFabricSource, createQdrantSource } from "../src/retrieval/sources.js";
import type { MemoryOSConfig } from "../src/types.js";

describe("retrieval sources", () => {
  it("maps pi-fabric recall results without writing Fabric storage or registering Fabric tools", async () => {
    recallMock.mockResolvedValueOnce({
      query: "retrieval aggregator",
      count: 1,
      results: [{
        score: 4.2,
        id: "abc123",
        agent: "icarus",
        type: "decision",
        timestamp: "2026-01-01T00:00:00Z",
        summary: "Use Fabric as a mandatory context source",
        file: "decision.md",
        path: "/tmp/fabric/decision.md",
      }],
    });

    const hits = await createFabricSource().search("retrieval aggregator", 5);

    expect(recallMock).toHaveBeenCalledWith(expect.any(Object), { query: "retrieval aggregator", max_results: 5 });
    expect(hits).toEqual([{
      id: "fabric:icarus:abc123",
      score: 4.2,
      text: "decision: Use Fabric as a mandatory context source\nfile: decision.md",
      source: "pi-fabric",
      tags: ["fabric", "decision", "icarus"],
      createdAt: "2026-01-01T00:00:00Z",
    }]);
  });

  it("normalizes structured Fabric summaries without leaking thinking blocks", async () => {
    recallMock.mockResolvedValueOnce({
      query: "fabric summary",
      count: 3,
      results: [
        {
          score: 3,
          id: "text-json",
          agent: "pi-agent",
          type: "decision",
          timestamp: "2026-01-01T00:00:00Z",
          summary: JSON.stringify([{ type: "thinking", thinking: "private chain of thought" }, { type: "text", text: "Public decision summary" }]),
          file: "decision.md",
          path: "/tmp/fabric/decision.md",
        },
        {
          score: 2,
          id: "thinking-only",
          agent: "pi-agent",
          type: "decision",
          timestamp: "2026-01-01T00:00:00Z",
          summary: JSON.stringify([{ type: "thinking", thinking: "private chain of thought" }]),
          file: "thinking.md",
          path: "/tmp/fabric/thinking.md",
        },
        {
          score: 1,
          id: "truncated-text",
          agent: "pi-agent",
          type: "decision",
          timestamp: "2026-01-01T00:00:00Z",
          summary: '[{"type":"text","text":"Public truncated summary with \\"quotes\\" and newline\\nmarker',
          file: "truncated.md",
          path: "/tmp/fabric/truncated.md",
        },
      ],
    });

    const hits = await createFabricSource().search("fabric summary", 5);

    expect(hits[0]?.text).toContain("Public decision summary");
    expect(hits[0]?.text).not.toContain("private chain of thought");
    expect(hits[1]?.text).toContain("[summary unavailable]");
    expect(hits[1]?.text).not.toContain("private chain of thought");
    expect(hits[2]?.text).toContain('Public truncated summary with "quotes" and newline\nmarker');
  });

  it("preserves Qdrant retrieval behavior behind a source interface", async () => {
    const config: MemoryOSConfig = {
      qdrantUrl: "http://qdrant",
      collection: "knowledge",
      redisHost: "localhost",
      redisPort: 6379,
      redisPassword: null,
      embeddingApiBase: "http://embed/v1",
      embeddingModel: "embed-model",
      embeddingDims: 3,
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
    embedTextMock.mockResolvedValueOnce([1, 2, 3]);
    embedSparseTextMock.mockResolvedValueOnce({ indices: [1], values: [0.5] });
    queryQdrantMock.mockResolvedValueOnce([{ id: "q1", score: 0.9, text: "qdrant memory", source: "pi-coding-agent", tags: [], createdAt: null }]);

    const hits = await createQdrantSource(config).search("qdrant query", 2);

    expect(embedTextMock).toHaveBeenCalledWith("qdrant query", {
      apiBase: "http://embed/v1",
      model: "embed-model",
      dims: 3,
      timeoutMs: 5000,
    });
    expect(embedSparseTextMock).toHaveBeenCalledWith("qdrant query", { dockerDir: null, python: "python3", timeoutMs: 5000 });
    expect(queryQdrantMock).toHaveBeenCalledWith("http://qdrant", "knowledge", [1, 2, 3], 2, 5000, { indices: [1], values: [0.5] });
    expect(hits[0]?.text).toBe("qdrant memory");
  });
});
