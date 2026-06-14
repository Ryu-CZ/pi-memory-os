import { describe, expect, it } from "vitest";
import { buildCaptureCandidate } from "../src/policy/capture-policy.js";

describe("buildCaptureCandidate", () => {
  it("rejects text shorter than 80 chars", () => {
    const result = buildCaptureCandidate("short text", "test");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("too short");
  });

  it("rejects pure acknowledgements and social closers", () => {
    const ack = "Thanks, that makes sense. I appreciate the help. Let me know if you need anything else.";
    const result = buildCaptureCandidate(ack, "test");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("acknowledgement");
  });

  it("rejects text where too much is redacted", () => {
    const secretText =
      "API_KEY=sk-1234567890abcdef SECRET_TOKEN=ghp_abc123 PASSWORD=hunter2 DB_PASS=secret123";
    const result = buildCaptureCandidate(secretText, "test");

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("redacted");
  });

  it("accepts decision summaries", () => {
    const decision =
      "We decided to use Qdrant for vector storage because it supports named vectors and has good performance for our use case with 1024-dimensional embeddings.";
    const result = buildCaptureCandidate(decision, "agent_end");

    expect(result.ok).toBe(true);
    expect(result.text).toBeDefined();
    expect(result.tags).toContain("auto");
    expect(result.tags).toContain("pi");
    expect(result.tags).toContain("agent_end");
    expect(result.tags).toContain("memory-os-capture");
    expect(result.tags).toContain("source_tool:pi-memory-os");
    expect(result.source).toBe("agent_end");
  });

  it("accepts fix summaries", () => {
    const fix =
      "Fixed the Redis connection issue by switching to Dragonfly which handles our concurrent workload better. The connection pool is now stable under load.";
    const result = buildCaptureCandidate(fix, "agent_end");

    expect(result.ok).toBe(true);
    expect(result.text).toBeDefined();
  });

  it("accepts outcome summaries", () => {
    const outcome =
      "The build now passes after updating the TypeScript configuration to use ES modules. All tests pass and the extension loads correctly in Pi.";
    const result = buildCaptureCandidate(outcome, "agent_end");

    expect(result.ok).toBe(true);
    expect(result.text).toBeDefined();
  });

  it("returns redacted text for accepted captures containing secrets", () => {
    const mixed =
      "Decided to use local embeddings. Set OPENAI_API_KEY=sk-123456 for the fallback provider. The primary path uses a local model instead.";
    const result = buildCaptureCandidate(mixed, "agent_end");

    expect(result.ok).toBe(true);
    expect(result.text).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(result.text).not.toContain("sk-123456");
  });

  it("includes reason for rejected captures", () => {
    const result = buildCaptureCandidate("ok thanks", "test");

    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
