import { loadConfig } from "./config.js";
import { embedText } from "./memory-os/embedding-client.js";
import { searchQdrant } from "./memory-os/qdrant-client.js";
import { createRedisClient, enqueueArqJob } from "./memory-os/redis-arq-client.js";
import { checkHealth } from "./memory-os/health.js";
import { handleSessionStart } from "./hooks/session-start.js";
import { handleBeforeAgentStart } from "./hooks/before-agent-start.js";
import { handleAgentEnd } from "./hooks/agent-end.js";
import type { SearchResult, StoreResult } from "./types.js";

const config = loadConfig();

function createSearch(): (query: string, limit: number) => Promise<SearchResult> {
  return async (query: string, limit: number): Promise<SearchResult> => {
    try {
      const vector = await embedText(query, {
        apiBase: config.embeddingApiBase,
        model: config.embeddingModel,
        dims: config.embeddingDims,
        timeoutMs: 5000,
      });
      const results = await searchQdrant(config.qdrantUrl, config.collection, vector, limit);
      return { ok: true, count: results.length, results };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        results: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

function createStore(): (text: string, source: string, tags: string[]) => Promise<StoreResult> {
  return async (text: string, source: string, tags: string[]): Promise<StoreResult> => {
    const redis = createRedisClient(config);
    // Memory OS worker expects positional args: process_ingestion(ctx, memory_text, source, tags)
    return enqueueArqJob(redis, "process_ingestion", [text, source, tags]);
  };
}

export default function extension(pi: {
  on: (event: string, handler: (...args: unknown[]) => unknown) => void;
  registerTool: (...args: unknown[]) => void;
}) {
  const state = { injectedIds: new Set<string>() };
  const search = createSearch();
  const store = createStore();

  pi.on("session_start", async (_event: unknown, ctx: unknown) => {
    try {
      state.injectedIds.clear();
      await handleSessionStart(ctx as never, {
        config,
        checkHealth: (cfg: typeof config) => checkHealth(cfg),
      });
    } catch {
      // Never throw — health failure must not break the session
    }
  });

  pi.on("before_agent_start", async (event: unknown) => {
    try {
      return handleBeforeAgentStart(event as never, state, { config, search });
    } catch {
      return;
    }
  });

  pi.on("agent_end", async (event: unknown) => {
    try {
      await handleAgentEnd(event as never, { config, store });
    } catch {
      // Never throw — capture failure must not break the session
    }
  });
}
