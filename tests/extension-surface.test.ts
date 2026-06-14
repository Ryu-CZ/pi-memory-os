import { describe, expect, it, vi } from "vitest";
import extension from "../src/index.js";

describe("extension surface", () => {
  it("registers lifecycle hooks but no tools", () => {
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
    };

    extension(pi as never);

    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("passes Pi event and context to session_start handler", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const pi = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(event, handler);
      }),
      registerTool: vi.fn(),
    };
    const ctx = { ui: { setStatus: vi.fn() } };

    extension(pi as never);
    await handlers.get("session_start")?.({ reason: "startup" }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("memory-os", expect.stringMatching(/^Memory OS:/));
  });
});
