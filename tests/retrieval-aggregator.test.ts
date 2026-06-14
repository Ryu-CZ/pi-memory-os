import { describe, expect, it } from "vitest";
import { aggregateRetrieval, type RetrievalSource } from "../src/retrieval/aggregator.js";
import type { MemoryHit } from "../src/types.js";

const hit = (id: string, source: string | null, text = "memory"): MemoryHit => ({
  id,
  score: 0.8,
  text,
  source,
  tags: [],
  createdAt: null,
});

describe("aggregateRetrieval", () => {
  it("combines labeled Fabric and Qdrant results", async () => {
    const sources: RetrievalSource[] = [
      { label: "pi-fabric", search: async () => [hit("fabric:a", "pi-fabric", "fabric context")] },
      { label: "qdrant", search: async () => [hit("q1", "pi-coding-agent", "qdrant memory")] },
    ];

    const result = await aggregateRetrieval(sources, "project decision", 3);

    expect(result.ok).toBe(true);
    expect(result.results.map((h) => h.text)).toEqual(["fabric context", "qdrant memory"]);
    expect(result.results.map((h) => h.source)).toEqual(["pi-fabric", "pi-coding-agent"]);
  });

  it("labels unlabeled hits with the source label", async () => {
    const result = await aggregateRetrieval(
      [{ label: "qdrant", search: async () => [hit("q1", null)] }],
      "project decision",
      3,
    );

    expect(result.results[0]?.source).toBe("qdrant");
  });

  it("keeps source failures local and returns surviving results", async () => {
    const sources: RetrievalSource[] = [
      { label: "pi-fabric", search: async () => { throw new Error("fabric unavailable"); } },
      { label: "qdrant", search: async () => [hit("q1", "qdrant")] },
    ];

    const result = await aggregateRetrieval(sources, "project decision", 3);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.results[0]?.source).toBe("qdrant");
  });

  it("round-robins sources so one source does not hide another", async () => {
    const sources: RetrievalSource[] = [
      { label: "pi-fabric", search: async () => [hit("f1", "pi-fabric"), hit("f2", "pi-fabric")] },
      { label: "qdrant", search: async () => [hit("q1", "qdrant"), hit("q2", "qdrant")] },
    ];

    const result = await aggregateRetrieval(sources, "project decision", 2);

    expect(result.results.map((h) => h.id)).toEqual(["f1", "q1", "f2", "q2"]);
  });
});
