#!/usr/bin/env node
// Smoke test: embed a query and search Qdrant for relevant memories.
// Usage: node scripts/smoke-search.mjs "your search query"
// Requires: npm run build

import { loadConfig } from "../dist/config.js";
import { embedText } from "../dist/memory-os/embedding-client.js";
import { searchQdrant } from "../dist/memory-os/qdrant-client.js";

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: node scripts/smoke-search.mjs \"your search query\"");
    process.exit(1);
  }

  const config = loadConfig();

  console.log(`Query: ${query}`);
  console.log(`Embedding: ${config.embeddingModel} (${config.embeddingDims}d)`);
  console.log(`Qdrant: ${config.qdrantUrl} collection=${config.collection}`);
  console.log();

  // Step 1: Embed the query
  let vector;
  try {
    vector = await embedText(query, {
      apiBase: config.embeddingApiBase,
      model: config.embeddingModel,
      dims: config.embeddingDims,
      timeoutMs: 10000,
    });
    console.log(`Embedding OK — ${vector.length} dims`);
  } catch (err) {
    console.error(`Embedding failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Search Qdrant
  let hits;
  try {
    hits = await searchQdrant(config.qdrantUrl, config.collection, vector, config.maxResults);
  } catch (err) {
    console.error(`Search failed: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Print results
  console.log(`\nFound ${hits.length} hit(s):\n`);

  if (hits.length === 0) {
    console.log("(no results)");
    return;
  }

  for (const [i, hit] of hits.entries()) {
    console.log(`--- Hit ${i + 1} ---`);
    console.log(`  id:    ${hit.id}`);
    console.log(`  score: ${hit.score !== null ? hit.score.toFixed(4) : "N/A"}`);
    console.log(`  source: ${hit.source ?? "unknown"}`);
    console.log(`  tags:  ${hit.tags.length ? hit.tags.join(", ") : "(none)"}`);
    console.log(`  text:  ${hit.text ? hit.text.slice(0, 200) : "(empty)"}`);
    console.log();
  }
}

main();
