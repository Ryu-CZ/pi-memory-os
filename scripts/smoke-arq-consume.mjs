#!/usr/bin/env node
// Smoke test: prove the existing ARQ worker consumes a pi-memory-os job.
// Usage: node scripts/smoke-arq-consume.mjs
// Requires: npm run build
//
// This is intentionally non-destructive: it enqueues whitespace memory_text, which
// the worker should consume and reject before embedding/Qdrant upsert.

import { loadConfig } from "../dist/config.js";
import { closeRedis, createRedisClient, enqueueArqJob } from "../dist/memory-os/redis-arq-client.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const config = loadConfig();
  const redis = createRedisClient(config);

  console.log("Memory OS ARQ Consumption Smoke");
  console.log("===============================");
  console.log(`redis: ${config.redisHost}:${config.redisPort}`);
  console.log();

  const result = await enqueueArqJob(redis, "process_ingestion", ["   ", "pi-memory-os-smoke", ["smoke", "non_destructive"]]);
  if (!result.ok || !result.jobId) {
    console.error(`Enqueue failed: ${result.error ?? "unknown failure"}`);
    process.exit(1);
  }

  console.log(`Enqueued process_ingestion job ${result.jobId}`);
  console.log("Waiting for ARQ worker to consume it...");

  const monitor = createRedisClient(config);
  let connected = false;
  try {
    await monitor.connect();
    connected = true;

    const jobKey = `arq:job:${result.jobId}`;
    const resultKey = `arq:result:${result.jobId}`;
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      const resultExists = await monitor.exists(resultKey);
      if (resultExists) {
        const jobExists = await monitor.exists(jobKey);
        const queueScore = await monitor.zscore("arq:queue", result.jobId);
        console.log("Worker consumed job:");
        console.log(`  resultKey: ${resultKey}`);
        console.log(`  jobExistsAfter: ${Boolean(jobExists)}`);
        console.log(`  queueScoreAfter: ${queueScore ?? "none"}`);
        return;
      }
      await sleep(1000);
    }

    const jobExists = await monitor.exists(jobKey);
    const queueScore = await monitor.zscore("arq:queue", result.jobId);
    console.error("Timed out waiting for ARQ result. Check the Memory OS worker logs.");
    console.error(`  jobExists: ${Boolean(jobExists)}`);
    console.error(`  queueScore: ${queueScore ?? "none"}`);
    process.exitCode = 1;
  } finally {
    await closeRedis(monitor, connected);
  }
}

main().catch((err) => {
  console.error(`ARQ smoke failed: ${err.message}`);
  process.exit(1);
});
