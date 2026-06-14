import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSessionStart } from "../src/hooks/session-start.js";
import type { SessionStartContext, SessionStartDeps } from "../src/hooks/session-start.js";
import type { HealthResult } from "../src/types.js";

function makeCtx() {
  return {
    ui: {
      setStatus: vi.fn(),
    },
  } as unknown as SessionStartContext;
}

function makeDeps(checkHealthFn: (config: unknown, deps?: unknown) => Promise<HealthResult>) {
  return {
    checkHealth: checkHealthFn,
    config: {} as unknown,
  } as unknown as SessionStartDeps;
}

describe("handleSessionStart", () => {
  it('sets "Memory OS: linked" on all-green health', async () => {
    const ctx = makeCtx();
    const deps = makeDeps(async () => ({
      ok: true,
      checks: { qdrant: { ok: true }, redis: { ok: true }, embeddings: { ok: true } },
    }));

    await handleSessionStart(ctx, deps);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("memory-os", "Memory OS: linked");
  });

  it('sets failing service names on partial failure', async () => {
    const ctx = makeCtx();
    const deps = makeDeps(async () => ({
      ok: false,
      checks: {
        qdrant: { ok: true },
        redis: { ok: false, error: "connection refused" },
        embeddings: { ok: false, error: "timeout" },
      },
    }));

    await handleSessionStart(ctx, deps);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("memory-os", "Memory OS: redis, embeddings");
  });

  it('sets "Memory OS: offline" when health check throws', async () => {
    const ctx = makeCtx();
    const deps = makeDeps(async () => {
      throw new Error("catastrophic failure");
    });

    await handleSessionStart(ctx, deps);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("memory-os", "Memory OS: offline");
  });

  it("never throws", async () => {
    const ctx = makeCtx();
    const deps = makeDeps(async () => {
      throw new Error("unexpected");
    });

    await expect(handleSessionStart(ctx, deps)).resolves.toBeUndefined();
  });
});
