import { filterInjectableHits, shouldSkipMemoryQuery } from "../policy/retrieval-policy.js";
import { GROUND_TRUTH_INSTRUCTION } from "../policy/ground-truth.js";
import { formatMemoryContext } from "../format/memory-context.js";
import type { MemoryHit, MemoryOSConfig, SearchResult } from "../types.js";

export interface MemorySessionState {
  injectedIds: Set<string>;
}

export interface BeforeAgentStartDeps {
  config: MemoryOSConfig;
  search: (query: string, limit: number) => Promise<SearchResult>;
}

export async function handleBeforeAgentStart(
  event: { prompt?: string; systemPrompt?: string },
  state: MemorySessionState,
  deps: BeforeAgentStartDeps,
): Promise<{ systemPrompt?: string; message?: { customType: string; content: string; display: boolean } } | void> {
  try {
    const { config } = deps;

    if (!config.injectionEnabled) return;

    const prompt = event.prompt?.trim();
    if (!prompt || shouldSkipMemoryQuery(prompt)) return;

    const result = await deps.search(prompt, config.maxResults);
    if (!result.ok || !result.results.length) return;

    const hits = filterInjectableHits(result.results, state.injectedIds, {
      minScore: config.minScore,
      maxResults: config.maxResults,
    });

    if (!hits.length) return;

    for (const hit of hits) {
      state.injectedIds.add(hit.id);
    }

    const context = formatMemoryContext(hits);
    const systemPrompt = event.systemPrompt
      ? `${event.systemPrompt}\n\n${GROUND_TRUTH_INSTRUCTION}`
      : GROUND_TRUTH_INSTRUCTION;

    return {
      systemPrompt,
      message: {
        customType: "memory-os-context",
        content: context,
        display: false,
      },
    };
  } catch {
    return;
  }
}
