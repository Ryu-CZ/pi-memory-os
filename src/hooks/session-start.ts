import type { MemoryOSConfig, HealthResult } from "../types.js";

export interface SessionStartContext {
  ui: {
    setStatus: (key: string, status: string | undefined) => void;
  };
}

export interface SessionStartDeps {
  config: MemoryOSConfig;
  checkHealth: (config: MemoryOSConfig, deps?: unknown) => Promise<HealthResult>;
}

export async function handleSessionStart(
  ctx: SessionStartContext,
  deps: SessionStartDeps,
): Promise<void> {
  try {
    const result = await deps.checkHealth(deps.config);

    if (result.ok) {
      ctx.ui.setStatus("memory-os", "Memory OS: linked");
      return;
    }

    const failing = Object.entries(result.checks)
      .filter(([, probe]) => !probe.ok)
      .map(([name]) => name);

    if (failing.length > 0) {
      ctx.ui.setStatus("memory-os", `Memory OS: ${failing.join(", ")}`);
    } else {
      ctx.ui.setStatus("memory-os", "Memory OS: linked");
    }
  } catch {
    ctx.ui.setStatus("memory-os", "Memory OS: offline");
  }
}
