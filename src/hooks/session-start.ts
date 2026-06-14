import { formatFabricBrief, type FabricBriefLike } from "../format/memory-context.js";
import type { MemoryOSConfig, HealthResult } from "../types.js";

export interface SessionStartContext {
  ui: {
    setStatus: (key: string, status: string | undefined) => void;
  };
}

export interface SessionStartDeps {
  config: MemoryOSConfig;
  checkHealth: (config: MemoryOSConfig, deps?: unknown) => Promise<HealthResult>;
  getFabricBrief?: () => Promise<FabricBriefLike>;
}

export interface SessionStartResult {
  message?: { customType: string; content: string; display: boolean };
}

export async function handleSessionStart(
  ctx: SessionStartContext,
  deps: SessionStartDeps,
): Promise<SessionStartResult | void> {
  try {
    const result = await deps.checkHealth(deps.config);

    if (result.ok) {
      ctx.ui.setStatus("memory-os", "Memory OS: linked");
    } else {
      const failing = Object.entries(result.checks)
        .filter(([, probe]) => !probe.ok)
        .map(([name]) => name);

      if (failing.length > 0) {
        ctx.ui.setStatus("memory-os", `Memory OS: ${failing.join(", ")}`);
      } else {
        ctx.ui.setStatus("memory-os", "Memory OS: linked");
      }
    }
  } catch {
    ctx.ui.setStatus("memory-os", "Memory OS: offline");
  }

  try {
    if (!deps.getFabricBrief) return;
    const brief = await deps.getFabricBrief();
    const content = formatFabricBrief(brief);
    if (!content.trim()) return;
    return { message: { customType: "fabric-operational-context", content, display: false } };
  } catch {
    return;
  }
}
