#!/usr/bin/env node
// Smoke test: aggregate health check against local Memory OS services.
// Usage: node scripts/smoke-health.mjs
// Requires: npm run build

import { loadConfig } from "../dist/config.js";
import { checkHealth } from "../dist/memory-os/health.js";

async function main() {
  const config = loadConfig();

  // Redact sensitive values before printing config summary
  const summary = {
    qdrantUrl: config.qdrantUrl,
    collection: config.collection,
    redisHost: `${config.redisHost}:${config.redisPort}`,
    redisPassword: config.redisPassword ? "[set]" : "[none]",
    embeddingApiBase: config.embeddingApiBase,
    embeddingModel: config.embeddingModel,
    embeddingDims: config.embeddingDims,
  };

  console.log("Memory OS Health Check");
  console.log("======================");
  console.log(JSON.stringify(summary, null, 2));
  console.log();

  try {
    const result = await checkHealth(config);

    // Redact any error messages that might contain secrets
    const redacted = {
      ok: result.ok,
      checks: {},
    };
    for (const [name, check] of Object.entries(result.checks)) {
      redacted.checks[name] = {
        ok: check.ok,
        statusCode: check.statusCode,
        hasOurCollection: check.hasOurCollection,
        error: check.error ? "[error — see stderr]" : undefined,
      };
    }

    console.log(JSON.stringify(redacted, null, 2));

    if (!result.ok) {
      // Print actual errors to stderr for debugging
      for (const [name, check] of Object.entries(result.checks)) {
        if (!check.ok) {
          console.error(`${name}: ${check.error ?? "unknown failure"}`);
        }
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Health check failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
