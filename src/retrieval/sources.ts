import { FabricStore, loadConfig as loadFabricConfig, recall } from "pi-fabric";
import { embedText } from "../memory-os/embedding-client.js";
import { queryQdrant } from "../memory-os/qdrant-client.js";
import { embedSparseText } from "../memory-os/sparse-embedding-client.js";
import type { MemoryOSConfig } from "../types.js";
import type { RetrievalSource } from "./aggregator.js";
export { createHermesFactsSource, createHermesSessionsSource } from "./hermes-sources.js";

function normalizeFabricSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const parts = Array.isArray(parsed) ? parsed : [parsed];
    const text = parts
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const record = part as Record<string, unknown>;
        if (record.type === "thinking") return [];
        return typeof record.text === "string" ? [record.text] : [];
      })
      .join("\n")
      .trim();
    return text || "[summary unavailable]";
  } catch {
    const textMatch = trimmed.match(/"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"([\s\S]*)/);
    if (textMatch?.[1]) {
      return textMatch[1]
        .replace(/"}\]?\s*$/, "")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
    }
    if (/^\s*(?:\{\s*|\[\s*\{\s*)"type"\s*:\s*"thinking"/.test(trimmed)) return "[summary unavailable]";
    return trimmed;
  }
}

export function createFabricSource(): RetrievalSource {
  const store = new FabricStore(loadFabricConfig());
  return {
    label: "pi-fabric",
    async search(query, limit) {
      const result = await recall(store, { query, max_results: limit });
      return result.results.map((entry) => ({
        id: `fabric:${entry.agent}:${entry.id}`,
        score: entry.score,
        text: `${entry.type}: ${normalizeFabricSummary(entry.summary)}\nfile: ${entry.file}`,
        source: "pi-fabric",
        tags: ["fabric", entry.type, entry.agent].filter(Boolean),
        createdAt: entry.timestamp,
      }));
    },
  };
}

export function createQdrantSource(config: MemoryOSConfig): RetrievalSource {
  return {
    label: "qdrant",
    async search(query, limit) {
      const vector = await embedText(query, {
        apiBase: config.embeddingApiBase,
        model: config.embeddingModel,
        dims: config.embeddingDims,
        timeoutMs: 5000,
      });
      const sparseVector = await embedSparseText(query, {
        dockerDir: config.sparseDockerDir,
        python: config.sparsePython,
        timeoutMs: 5000,
      }).catch(() => null);
      return queryQdrant(config.qdrantUrl, config.collection, vector, limit, 5000, sparseVector);
    },
  };
}
