import { describe, expect, it, vi } from "vitest";
import { handleBeforeAgentStart } from "../src/hooks/before-agent-start.js";
import type { BeforeAgentStartDeps, MemorySessionState } from "../src/hooks/before-agent-start.js";
import type { MemoryHit, MemoryOSConfig, SearchResult } from "../src/types.js";

function makeState(): MemorySessionState {
  return { injectedIds: new Set<string>() };
}

function makeDeps(configOverrides?: Partial<MemoryOSConfig>, searchFn?: (query: string, limit: number) => Promise<SearchResult>): BeforeAgentStartDeps {
  return {
    config: {
      qdrantUrl: "http://localhost:6333",
      collection: "kb",
      redisHost: "localhost",
      redisPort: 6379,
      redisPassword: null,
      embeddingApiBase: "http://localhost:7485/v1",
      embeddingModel: "test",
      embeddingDims: 512,
      source: "test",
      minScore: 0.35,
      maxResults: 3,
      hermesStateDbPath: null,
      hermesMemoryStoreDbPath: null,
      sparseDockerDir: null,
      sparsePython: "python3",
      injectionEnabled: true,
      captureEnabled: true,
      ...configOverrides,
    },
    search: searchFn ?? vi.fn(),
  };
}

function makeHit(overrides?: Partial<MemoryHit>): MemoryHit {
  return {
    id: "hit-1",
    score: 0.8,
    text: "a useful memory",
    source: "test",
    tags: ["test"],
    createdAt: "2025-01-01",
    ...overrides,
  };
}

describe("handleBeforeAgentStart", () => {
  it("returns nothing when injection disabled", async () => {
    const deps = makeDeps({ injectionEnabled: false });
    const state = makeState();
    const result = await handleBeforeAgentStart({ prompt: "do something" }, state, deps);
    expect(result).toBeUndefined();
  });

  it('returns nothing for "README.md" (low-info prompt)', async () => {
    const deps = makeDeps();
    const state = makeState();
    const result = await handleBeforeAgentStart({ prompt: "README.md" }, state, deps);
    expect(result).toBeUndefined();
    expect(deps.search).not.toHaveBeenCalled();
  });

  it("calls retrieval for meaningful prompt", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, count: 0, results: [] });
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    await handleBeforeAgentStart({ prompt: "how do I configure the redis connection" }, state, deps);
    expect(searchFn).toHaveBeenCalled();
  });

  it("filters low-score hits", async () => {
    const searchFn = vi.fn().mockResolvedValue({
      ok: true,
      count: 2,
      results: [makeHit({ id: "good", score: 0.8, text: "high score memory" }), makeHit({ id: "bad", score: 0.1, text: "low score memory" })],
    });
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    const result = await handleBeforeAgentStart({ prompt: "tell me about config" }, state, deps);
    expect(result?.message?.content).toContain("high score memory");
    expect(result?.message?.content).not.toContain("low score memory");
  });

  it("includes GROUND_TRUTH_INSTRUCTION in returned systemPrompt", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, count: 1, results: [makeHit()] });
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    const result = await handleBeforeAgentStart({ prompt: "tell me about config", systemPrompt: "base prompt" }, state, deps);
    expect(result?.systemPrompt).toContain("base prompt");
    expect(result?.systemPrompt).toContain("Memory OS context is authoritative");
  });

  it("includes formatted context message", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, count: 1, results: [makeHit({ id: "abc", text: "useful fact" })] });
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    const result = await handleBeforeAgentStart({ prompt: "tell me about config" }, state, deps);
    expect(result?.message).toBeDefined();
    expect(result?.message?.customType).toBe("memory-os-context");
    expect(result?.message?.content).toContain("useful fact");
    expect(result?.message?.display).toBe(false);
  });

  it("adds injected IDs to session dedupe set", async () => {
    const searchFn = vi.fn().mockResolvedValue({ ok: true, count: 1, results: [makeHit({ id: "abc" })] });
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    await handleBeforeAgentStart({ prompt: "tell me about config" }, state, deps);
    expect(state.injectedIds.has("test:abc")).toBe(true);
  });

  it("does not throw when retrieval fails", async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error("network error"));
    const deps = makeDeps({}, searchFn);
    const state = makeState();
    await expect(
      handleBeforeAgentStart({ prompt: "tell me about config" }, state, deps),
    ).resolves.toBeUndefined();
  });
});
