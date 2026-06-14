import { describe, expect, it } from "vitest";
import { filterInjectableHits, shouldSkipMemoryQuery } from "../src/policy/retrieval-policy.js";
import type { MemoryHit } from "../src/types.js";

const hit = (id: string, score: number | null, text = "memory"): MemoryHit => ({
  id,
  score,
  text,
  source: "qdrant",
  tags: [],
  createdAt: null,
});

describe("shouldSkipMemoryQuery", () => {
  it.each(["README.md", "package.json", "ok", "yes", "thanks", "continue", "go on"])(
    "skips low-information prompt %s",
    (query) => expect(shouldSkipMemoryQuery(query)).toBe(true),
  );

  it("does not skip meaningful prompts", () => {
    expect(shouldSkipMemoryQuery("why did we choose qdrant for pi memory?")).toBe(false);
  });
});

describe("filterInjectableHits", () => {
  it("removes already injected, low-score Qdrant, and empty-text hits", () => {
    const injected = new Set(["qdrant:old"]);
    const result = filterInjectableHits(
      [hit("old", 0.9), hit("low", 0.1), hit("empty", 0.9, "  "), hit("good", 0.8)],
      injected,
      { minScore: 0.35, maxResults: 3 },
    );

    expect(result.map((h) => h.id)).toEqual(["good"]);
  });

  it("limits result count", () => {
    const result = filterInjectableHits(
      [hit("a", 0.9), hit("b", 0.8), hit("c", 0.7)],
      new Set(),
      { minScore: 0.35, maxResults: 2 },
    );

    expect(result.map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("applies source budgets so Fabric and Qdrant can both survive filtering", () => {
    const fabricHit = { ...hit("fabric:decision", 0.01, "fabric context"), source: "pi-fabric", tags: ["fabric"] };
    const qdrantHit = { ...hit("q1", 0.9, "qdrant memory"), source: "pi-coding-agent" };
    const result = filterInjectableHits(
      [qdrantHit, hit("q2", 0.8), hit("q3", 0.7), fabricHit],
      new Set(),
      { minScore: 0.35, maxResults: 3 },
    );

    expect(result.map((h) => h.id)).toEqual(["q1", "q2", "fabric:decision"]);
  });

  it("does not apply Qdrant similarity threshold to Fabric lexical scores", () => {
    const result = filterInjectableHits(
      [{ ...hit("fabric:low", 0.01, "lexical Fabric hit"), source: "pi-fabric", tags: ["fabric"] }, hit("q-low", 0.1), hit("q-good", 0.8)],
      new Set(),
      { minScore: 0.35, maxResults: 3 },
    );

    expect(result.map((h) => h.id)).toEqual(["fabric:low", "q-good"]);
  });

  it("allows explicit per-source score policies", () => {
    const result = filterInjectableHits(
      [{ ...hit("fabric:low", 0.1), source: "pi-fabric", tags: ["fabric"] }, hit("q-low", 0.1)],
      new Set(),
      {
        minScore: 0.35,
        maxResults: 3,
        sourcePolicies: {
          fabric: { maxResults: 2, minScore: 0.2 },
          qdrant: { maxResults: 2, minScore: null },
        },
      },
    );

    expect(result.map((h) => h.id)).toEqual(["q-low"]);
  });

  it("does not apply Qdrant similarity threshold to Hermes read-only sources", () => {
    const result = filterInjectableHits(
      [
        { ...hit("hermes-session:1", null), source: "hermes-sessions", tags: ["hermes", "session"] },
        { ...hit("hermes-fact:1", 0.1), source: "hermes-facts", tags: ["hermes", "fact"] },
        hit("q-low", 0.1),
      ],
      new Set(),
      { minScore: 0.35, maxResults: 3 },
    );

    expect(result.map((h) => h.id)).toEqual(["hermes-session:1", "hermes-fact:1"]);
  });

  it("dedupes by source and id so different sources may share raw ids", () => {
    const injected = new Set(["qdrant:shared"]);
    const result = filterInjectableHits(
      [hit("shared", 0.9), { ...hit("shared", 0.9), source: "pi-fabric" }],
      injected,
      { minScore: 0.35, maxResults: 3 },
    );

    expect(result.map((h) => `${h.source}:${h.id}`)).toEqual(["pi-fabric:shared"]);
  });
});
