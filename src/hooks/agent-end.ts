import { buildCaptureCandidate } from "../policy/capture-policy.js";
import type { MemoryOSConfig, StoreResult } from "../types.js";

export interface AgentEndDeps {
  config: MemoryOSConfig;
  store: (text: string, source: string, tags: string[]) => Promise<StoreResult>;
}

export async function handleAgentEnd(
  event: { messages?: Array<{ role: string; content?: unknown }> },
  deps: AgentEndDeps,
): Promise<void> {
  try {
    const { config } = deps;

    if (!config.captureEnabled) return;

    const messages = event.messages ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant || typeof lastAssistant.content !== "string") return;

    const candidate = buildCaptureCandidate(lastAssistant.content, config.source);
    if (!candidate.ok || !candidate.text || !candidate.source || !candidate.tags) return;

    await deps.store(candidate.text, candidate.source, candidate.tags);
  } catch {
    // Never throw — capture failure must not break the session
  }
}
