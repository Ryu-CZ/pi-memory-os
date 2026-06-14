import { afterEach, describe, expect, it, vi } from "vitest";
import { probeQdrant, queryQdrant, searchQdrant } from "../src/memory-os/qdrant-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("probeQdrant", () => {
  it("returns collection list and hasOurCollection when collection exists", async () => {
    const collections = [
      { name: "knowledge_base", status: "green" },
      { name: "other", status: "green" },
    ];
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: { collections } }), { status: 200 }),
    ) as typeof fetch;

    const result = await probeQdrant("http://localhost:6333", "knowledge_base");

    expect(result.ok).toBe(true);
    expect(result.hasOurCollection).toBe(true);
    expect(result.collections).toEqual(collections);
  });

  it("returns hasOurCollection false when collection not found", async () => {
    const collections = [
      { name: "other", status: "green" },
    ];
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: { collections } }), { status: 200 }),
    ) as typeof fetch;

    const result = await probeQdrant("http://localhost:6333", "knowledge_base");

    expect(result.ok).toBe(true);
    expect(result.hasOurCollection).toBe(false);
  });

  it("returns ok false on non-200 response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("Internal Server Error", { status: 500 }),
    ) as typeof fetch;

    const result = await probeQdrant("http://localhost:6333", "knowledge_base");

    expect(result.ok).toBe(false);
  });
});

describe("queryQdrant", () => {
  it("POSTs to /collections/<collection>/points/query with named dense vector", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: { points: [] } }), { status: 200 }),
    ) as typeof fetch;

    await queryQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 5);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("http://localhost:6333/collections/knowledge_base/points/query");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body as string);
    expect(body.query).toEqual([1, 2, 3]);
    expect(body.using).toBe("dense");
    expect(body.limit).toBe(5);
    expect(body.with_payload).toBe(true);
    expect(body.with_vector).toBe(false);
  });

  it("POSTs hybrid dense+sparse RRF query when sparse vector is available", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: { points: [] } }), { status: 200 }),
    ) as typeof fetch;

    await queryQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 5, 5000, { indices: [10, 20], values: [0.3, 0.7] });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.prefetch).toEqual([
      { query: [1, 2, 3], using: "dense", limit: 15 },
      { query: { indices: [10, 20], values: [0.3, 0.7] }, using: "sparse", limit: 15 },
    ]);
    expect(body.query).toEqual({ fusion: "rrf" });
    expect(body.limit).toBe(5);
    expect(body.with_payload).toBe(true);
    expect(body.with_vector).toBe(false);
  });

  it("maps /points/query response envelopes", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            points: [
              {
                id: "hit1",
                score: 0.85,
                payload: { text: "Important memory.", source: "pi", tags: [], created_at: "now" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const hits = await queryQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 10);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "hit1", score: 0.85, text: "Important memory." });
  });

  it("falls back to /points/search when /points/query is unavailable", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).endsWith("/points/query")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(
        JSON.stringify({ result: [{ id: "fallback", score: 0.7, payload: { text: "Fallback memory." } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const hits = await queryQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 10);

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])).toEqual([
      "http://localhost:6333/collections/knowledge_base/points/query",
      "http://localhost:6333/collections/knowledge_base/points/search",
    ]);
    expect(hits[0]).toMatchObject({ id: "fallback", text: "Fallback memory." });
  });
});

describe("searchQdrant", () => {
  it("POSTs to /collections/<collection>/points/search with named vector shape", async () => {
    const results = [
      {
        id: "abc",
        score: 0.92,
        payload: {
          text: "Remember this.",
          source: "pi-coding-agent",
          tags: ["project"],
          created_at: "2026-06-13T00:00:00Z",
        },
      },
    ];
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: results }), { status: 200 }),
    ) as typeof fetch;

    await searchQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 5);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("http://localhost:6333/collections/knowledge_base/points/search");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body as string);
    expect(body.vector).toEqual({ name: "dense", vector: [1, 2, 3] });
    expect(body.limit).toBe(5);
    expect(body.with_payload).toBe(true);
    expect(body.with_vector).toBe(false);
  });

  it("maps payload to MemoryHit fields", async () => {
    const results = [
      {
        id: "hit1",
        score: 0.85,
        payload: {
          text: "Important memory.",
          source: "pi-coding-agent",
          tags: ["work"],
          created_at: "2026-06-13T00:00:00Z",
        },
      },
      {
        id: "hit2",
        score: 0.7,
        payload: {
          text: "Another memory.",
          source: null,
          tags: [],
          created_at: null,
        },
      },
    ];
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: results }), { status: 200 }),
    ) as typeof fetch;

    const hits = await searchQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 10);

    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      id: "hit1",
      score: 0.85,
      text: "Important memory.",
      source: "pi-coding-agent",
      tags: ["work"],
      createdAt: "2026-06-13T00:00:00Z",
    });
    expect(hits[1]).toEqual({
      id: "hit2",
      score: 0.7,
      text: "Another memory.",
      source: null,
      tags: [],
      createdAt: null,
    });
  });

  it("uses title and content_preview as fallback text for richer Memory OS payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: [
            {
              id: "hit1",
              score: 0.75,
              payload: {
                title: "Memory OS boundary",
                content_preview: "Ambient memory belongs in pi-memory-os.",
                source: "icarus",
                tags: ["design"],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const hits = await searchQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 10);

    expect(hits[0]).toMatchObject({
      id: "hit1",
      text: "Memory OS boundary\nAmbient memory belongs in pi-memory-os.",
      source: "icarus",
      tags: ["design"],
    });
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("Bad Gateway", { status: 502 }),
    ) as typeof fetch;

    await expect(
      searchQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 5),
    ).rejects.toThrow("search HTTP 502");
  });

  it("maps query_points response envelopes too", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            points: [
              {
                id: "hit1",
                score: 0.85,
                payload: { text: "Important memory.", source: "pi", tags: [], created_at: "now" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const hits = await searchQdrant("http://localhost:6333", "knowledge_base", [1, 2, 3], 10);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "hit1", score: 0.85, text: "Important memory." });
  });
});
