import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: existsSyncMock,
}));

const { createHermesFactsSource, createHermesSessionsSource } = await import("../src/retrieval/hermes-sources.js");

function mockSqliteRows(rows: unknown[]) {
  execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => cb(null, JSON.stringify(rows), ""));
}

describe("Hermes retrieval sources", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
  });

  it("skips missing Hermes DB paths", () => {
    existsSyncMock.mockReturnValue(false);

    expect(createHermesSessionsSource("/missing/state.db")).toBeNull();
    expect(createHermesFactsSource(null)).toBeNull();
  });

  it("maps read-only Hermes session FTS rows to memory hits", async () => {
    mockSqliteRows([
      {
        id: 42,
        content: "We debugged the Pi retrieval pipeline and fixed source labels.",
        role: "assistant",
        timestamp: 1_700_000_000,
        title: "Pi memory work",
        session_source: "pi",
      },
    ]);

    const source = createHermesSessionsSource("/tmp/state.db");
    const hits = await source?.search("retrieval pipeline", 2);

    expect(execFileMock).toHaveBeenCalledWith(
      "sqlite3",
      expect.arrayContaining(["-readonly", "-json", "/tmp/state.db"]),
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
    expect(hits).toEqual([
      expect.objectContaining({
        id: "hermes-session:42",
        score: null,
        source: "hermes-sessions",
        text: expect.stringContaining("We debugged the Pi retrieval pipeline"),
        tags: expect.arrayContaining(["hermes", "session", "assistant", "pi"]),
        createdAt: "2023-11-14T22:13:20.000Z",
      }),
    ]);
  });

  it("maps read-only Hermes fact FTS rows to memory hits", async () => {
    mockSqliteRows([
      {
        fact_id: 7,
        content: "The local Memory OS uses Qdrant collection knowledge_base.",
        category: "project",
        tags: "memory-os qdrant",
        trust_score: 0.8,
        created_at: "2026-06-14 12:00:00",
      },
    ]);

    const source = createHermesFactsSource("/tmp/memory_store.db");
    const hits = await source?.search("qdrant collection", 2);

    expect(hits).toEqual([
      expect.objectContaining({
        id: "hermes-fact:7",
        score: 0.8,
        source: "hermes-facts",
        text: "The local Memory OS uses Qdrant collection knowledge_base.",
        tags: expect.arrayContaining(["hermes", "fact", "project", "memory-os", "qdrant"]),
        createdAt: "2026-06-14 12:00:00",
      }),
    ]);
  });

  it("keeps Hermes source failures local", async () => {
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => cb(new Error("sqlite unavailable"), "", ""));

    const source = createHermesSessionsSource("/tmp/state.db");
    await expect(source?.search("anything", 2)).resolves.toEqual([]);
  });
});
