import { afterEach, describe, expect, it, vi } from "vitest";
import { embedText, clearEmbeddingCache } from "../src/memory-os/embedding-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearEmbeddingCache();
});

describe("embedText", () => {
  it("posts to /embeddings and returns numeric vector", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: ["1", 2, 3] }] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const vector = await embedText("hello", {
      apiBase: "http://embed/v1",
      model: "qwen3-embed-0.6b",
      timeoutMs: 1000,
    });

    expect(vector).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://embed/v1/embeddings",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on invalid embedding response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;

    await expect(embedText("hello", { apiBase: "http://embed/v1", model: "m", timeoutMs: 1000 })).rejects.toThrow(
      "embedding: empty data array",
    );
  });

  it("throws when returned vector dimensions do not match configured dims", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 }),
    ) as typeof fetch;

    await expect(
      embedText("hello", { apiBase: "http://embed/v1", model: "m", dims: 1024, timeoutMs: 1000 }),
    ).rejects.toThrow("embedding: expected 1024 dimensions, got 3");
  });

  it("caches embedding results and skips API calls on repeated text", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: ["1", "2", "3"] }] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const opts = { apiBase: "http://embed/v1", model: "m", timeoutMs: 1000 };
    await embedText("hello", opts);
    await embedText("hello", opts);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse cached vectors across different dimension settings", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: ["1", "2", "3"] }] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await embedText("hello", { apiBase: "http://embed/v1", model: "m", dims: 3, timeoutMs: 1000 });
    await expect(
      embedText("hello", { apiBase: "http://embed/v1", model: "m", dims: 1024, timeoutMs: 1000 }),
    ).rejects.toThrow("embedding: expected 1024 dimensions, got 3");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("misses cache for different text", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ embedding: ["1", "2", "3"] }] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const opts = { apiBase: "http://embed/v1", model: "m", timeoutMs: 1000 };
    await embedText("hello", opts);
    await embedText("world", opts);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
