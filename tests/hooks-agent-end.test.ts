import { describe, expect, it, vi } from "vitest";
import { handleAgentEnd } from "../src/hooks/agent-end.js";
import type { AgentEndDeps, StoreResult } from "../src/hooks/agent-end.js";
import type { MemoryOSConfig } from "../src/types.js";

function makeDeps(
  configOverrides?: Partial<MemoryOSConfig>,
  storeFn?: (text: string, source: string, tags: string[]) => Promise<StoreResult>,
): AgentEndDeps {
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
    store: storeFn ?? vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe("handleAgentEnd", () => {
  it("capture disabled returns without enqueue", async () => {
    const storeFn = vi.fn();
    const deps = makeDeps({ captureEnabled: false }, storeFn);
    const event = {
      messages: [{ role: "assistant", content: "This is a long assistant message that is definitely over eighty characters long." }],
    };
    await handleAgentEnd(event, deps);
    expect(storeFn).not.toHaveBeenCalled();
  });

  it("no assistant messages returns without enqueue", async () => {
    const storeFn = vi.fn();
    const deps = makeDeps({}, storeFn);
    const event = {
      messages: [{ role: "user", content: "hello" }],
    };
    await handleAgentEnd(event, deps);
    expect(storeFn).not.toHaveBeenCalled();
  });

  it("short assistant message returns without enqueue", async () => {
    const storeFn = vi.fn();
    const deps = makeDeps({}, storeFn);
    const event = {
      messages: [{ role: "assistant", content: "short" }],
    };
    await handleAgentEnd(event, deps);
    expect(storeFn).not.toHaveBeenCalled();
  });

  it("useful assistant message enqueues process_ingestion", async () => {
    const storeFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps({}, storeFn);
    const event = {
      messages: [
        { role: "user", content: "fix the bug" },
        { role: "assistant", content: "I fixed the bug by updating the config to use the correct Redis port. The service now starts correctly." },
      ],
    };
    await handleAgentEnd(event, deps);
    expect(storeFn).toHaveBeenCalledTimes(1);
    expect(storeFn).toHaveBeenCalledWith(
      expect.stringContaining("fixed the bug"),
      "test",
      expect.arrayContaining(["auto", "pi", "agent_end", "memory-os-capture", "source_tool:pi-memory-os"]),
    );
  });

  it("enqueue failure is swallowed", async () => {
    const storeFn = vi.fn().mockRejectedValue(new Error("redis down"));
    const deps = makeDeps({}, storeFn);
    const event = {
      messages: [
        { role: "assistant", content: "I fixed the bug by updating the config to use the correct Redis port. The service now starts correctly." },
      ],
    };
    await expect(handleAgentEnd(event, deps)).resolves.toBeUndefined();
    expect(storeFn).toHaveBeenCalledTimes(1);
  });

  it("captured text is redacted", async () => {
    const storeFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps({}, storeFn);
    const event = {
      messages: [
        { role: "assistant", content: "I set the OPENAI_API_KEY=sk-secret123 in the config file. The service now starts correctly and connects to the API." },
      ],
    };
    await handleAgentEnd(event, deps);
    expect(storeFn).toHaveBeenCalledWith(
      expect.stringContaining("[REDACTED]"),
      "test",
      expect.any(Array),
    );
    expect(storeFn).not.toHaveBeenCalledWith(
      expect.stringContaining("sk-secret123"),
      expect.any(String),
      expect.any(Array),
    );
  });
});
