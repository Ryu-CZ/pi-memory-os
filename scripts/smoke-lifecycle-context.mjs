#!/usr/bin/env node
// Smoke test: verify lifecycle injection can contain both pi-fabric and
// Qdrant/Memory OS context through handleBeforeAgentStart, and that
// session_start can inject a Fabric operational brief through pi-fabric.
// Usage: npm run smoke:lifecycle-context
// Requires: Fabric data present, Qdrant + embedding services running.

import { FabricStore, loadConfig as loadFabricConfig } from "pi-fabric";
import { loadConfig } from "../dist/config.js";
import { handleBeforeAgentStart } from "../dist/hooks/before-agent-start.js";
import { handleSessionStart } from "../dist/hooks/session-start.js";
import { checkHealth } from "../dist/memory-os/health.js";
import { aggregateRetrieval } from "../dist/retrieval/aggregator.js";
import { createFabricSource, createQdrantSource } from "../dist/retrieval/sources.js";

const QUERY = process.argv.slice(2).join(" ").trim() || "what did we decide about pi-memory-os boundaries?";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Lifecycle Context Verification");
  console.log("================================");

  const config = loadConfig();
  if (!config.injectionEnabled) fail("MEMORY_OS_INJECTION_ENABLED is false");

  const fabricStore = new FabricStore(loadFabricConfig());
  const sessionCtx = { ui: { setStatus: (_key, status) => console.log(`Status:  ${status}`) } };
  const sessionResult = await handleSessionStart(sessionCtx, {
    config,
    checkHealth: (cfg) => checkHealth(cfg),
    getFabricBrief: () => fabricStore.brief(),
  });
  const briefContent = sessionResult?.message?.content ?? "";
  if (sessionResult?.message?.customType !== "fabric-operational-context") fail("no hidden fabric-operational-context message returned from session_start");
  if (sessionResult.message.display !== false) fail("Fabric operational context message is not hidden");
  if (!briefContent.includes("Fabric operational brief:")) fail("Fabric operational brief header missing");
  if (!briefContent.includes("pending: total=")) fail("Fabric operational brief pending counts missing");

  const sources = [createFabricSource(), createQdrantSource(config)];
  const search = (query, limit) => aggregateRetrieval(sources, query, limit);
  const state = { injectedIds: new Set() };

  console.log(`Sources: ${sources.map((s) => s.label).join(", ")}`);
  console.log(`Query:   ${QUERY}`);

  const result = await handleBeforeAgentStart(
    { prompt: QUERY, systemPrompt: "lifecycle context smoke" },
    state,
    { config, search },
  );

  const content = result?.message?.content ?? "";
  const hasFabric = content.includes("[pi-fabric score:");
  const hasMemoryOS = /\[(?!pi-fabric)[^\]\n]+ score:/.test(content);

  if (result?.message?.customType !== "memory-os-context") fail("no hidden memory-os-context message returned");
  if (result.message.display !== false) fail("memory context message is not hidden");
  if (!hasFabric) fail("injected context is missing a pi-fabric source block");
  if (!hasMemoryOS) fail("injected context is missing a Qdrant/Memory OS source block");

  const headers = content.split("\n").filter((line) => /^\[[^\]]+ score:/.test(line));
  console.log(`Fabric brief: ${briefContent.split("\n").slice(0, 4).join(" | ")}`);
  console.log(`Injected keys: ${[...state.injectedIds].join(", ")}`);
  console.log(`Source headers: ${headers.join(" | ")}`);
  console.log("PASS: session_start Fabric brief and before_agent_start dual-source context verified");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
