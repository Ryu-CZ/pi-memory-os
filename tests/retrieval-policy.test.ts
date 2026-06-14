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
  it("removes already injected, low-score, and empty-text hits", () => {
    const injected = new Set(["old"]);
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
});
