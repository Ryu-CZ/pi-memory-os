import type { MemoryOSConfig } from "./types.js";

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envNullable(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() ? value : null;
}

function envInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export function loadConfig(): MemoryOSConfig {
  return {
    qdrantUrl: envStr("MEMORY_OS_QDRANT_URL", "http://127.0.0.1:6333"),
    collection: envStr("MEMORY_OS_COLLECTION", "knowledge_base"),
    redisHost: envStr("MEMORY_OS_REDIS_HOST", "127.0.0.1"),
    redisPort: envInt("MEMORY_OS_REDIS_PORT", 6379),
    redisPassword: envNullable("MEMORY_OS_REDIS_PASSWORD"),
    embeddingApiBase: envStr("MEMORY_OS_EMBEDDING_API_BASE", "http://127.0.0.1:7485/v1"),
    embeddingModel: envStr("MEMORY_OS_EMBEDDING_MODEL", "qwen3-embed-0.6b"),
    embeddingDims: envInt("MEMORY_OS_EMBEDDING_DIMS", 1024),
    source: envStr("MEMORY_OS_SOURCE", "pi-coding-agent"),
    minScore: envFloat("MEMORY_OS_MIN_SCORE", 0.35),
    maxResults: envInt("MEMORY_OS_MAX_RESULTS", 3),
    injectionEnabled: envBool("MEMORY_OS_INJECTION_ENABLED", true),
    captureEnabled: envBool("MEMORY_OS_CAPTURE_ENABLED", true),
  };
}
