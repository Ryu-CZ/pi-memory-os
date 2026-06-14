#!/usr/bin/env node
// Smoke test: enqueue a harmless ingestion probe and wait for it to appear in Qdrant.
// Usage: node scripts/smoke-ingest.mjs
// Requires: npm run build

import { loadConfig } from "../dist/config.js";
import { embedText } from "../dist/memory-os/embedding-client.js";
import { searchQdrant } from "../dist/memory-os/qdrant-client.js";
import { createRedisClient, enqueueArqJob } from "../dist/memory-os/redis-arq-client.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function searchForProbe(config, probeId) {
  const vector = await embedText(probeId, {
    apiBase: config.embeddingApiBase,
    model: config.embeddingModel,
    dims: config.embeddingDims,
    timeoutMs: 10000,
  });
  const hits = await searchQdrant(config.qdrantUrl, config.collection, vector, Math.max(config.maxResults, 5));
  return hits.find((hit) => hit.text?.includes(probeId));
}

async function main() {
  const config = loadConfig();
  const probeId = `pi-memory-os-smoke-${Date.now()}`;
  const text = [
    `Smoke probe ${probeId}.`,
    "This is a harmless local Memory OS ingestion verification record.",
    "It verifies that pi-memory-os can enqueue process_ingestion and the worker can index the result.",
  ].join(" ");

  console.log("Memory OS Ingestion Smoke");
  console.log("=========================");
  console.log(`probeId: ${probeId}`);
  console.log(`redis: ${config.redisHost}:${config.redisPort}`);
  console.log(`qdrant: ${config.qdrantUrl} collection=${config.collection}`);
  console.log();

  const redis = createRedisClient(config);
  const result = await enqueueArqJob(redis, "process_ingestion", [text, config.source, ["smoke", "pi", "agent_end"]]);
  if (!result.ok) {
    console.error(`Enqueue failed: ${result.error ?? "unknown failure"}`);
    process.exit(1);
  }

  console.log(`Enqueued process_ingestion job ${result.jobId}`);
  console.log("Waiting for worker ingestion and Qdrant indexing...");

  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const hit = await searchForProbe(config, probeId);
      if (hit) {
        console.log("Indexed probe found:");
        console.log(`  id:    ${hit.id}`);
        console.log(`  score: ${hit.score !== null ? hit.score.toFixed(4) : "N/A"}`);
        console.log(`  source: ${hit.source ?? "unknown"}`);
        console.log(`  tags:  ${hit.tags.length ? hit.tags.join(", ") : "(none)"}`);
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(3000);
  }

  if (lastError) {
    console.error(`Last search error: ${lastError.message}`);
  }
  console.error("Timed out waiting for indexed probe. Check the Memory OS worker logs.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`Ingestion smoke failed: ${err.message}`);
  process.exit(1);
});
