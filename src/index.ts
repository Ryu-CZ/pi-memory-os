import { FabricStore, loadConfig as loadFabricConfig } from "pi-fabric";
import { loadConfig } from "./config.js";
import { aggregateRetrieval } from "./retrieval/aggregator.js";
import { createFabricSource, createHermesFactsSource, createHermesSessionsSource, createQdrantSource } from "./retrieval/sources.js";
import { createRedisClient, enqueueArqJob } from "./memory-os/redis-arq-client.js";
import { checkHealth } from "./memory-os/health.js";
import { handleSessionStart } from "./hooks/session-start.js";
import { handleBeforeAgentStart } from "./hooks/before-agent-start.js";
import { handleAgentEnd } from "./hooks/agent-end.js";
import type { SearchResult, StoreResult } from "./types.js";
import type { RetrievalSource } from "./retrieval/aggregator.js";

const config = loadConfig();
const fabricStore = new FabricStore(loadFabricConfig());

function createSearch(): (query: string, limit: number) => Promise<SearchResult> {
  const optionalSources = [
    createHermesSessionsSource(config.hermesStateDbPath),
    createHermesFactsSource(config.hermesMemoryStoreDbPath),
  ].filter((source): source is RetrievalSource => source !== null);
  const sources = [createFabricSource(), createQdrantSource(config), ...optionalSources];
  return (query: string, limit: number): Promise<SearchResult> => aggregateRetrieval(sources, query, limit);
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
      return await handleSessionStart(ctx as never, {
        config,
        checkHealth: (cfg: typeof config) => checkHealth(cfg),
        getFabricBrief: () => fabricStore.brief(),
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
