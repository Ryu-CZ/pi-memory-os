export interface MemoryOSConfig {
  qdrantUrl: string;
  collection: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string | null;
  embeddingApiBase: string;
  embeddingModel: string;
  embeddingDims: number;
  source: string;
  minScore: number;
  maxResults: number;
  hermesStateDbPath: string | null;
  hermesMemoryStoreDbPath: string | null;
  sparseDockerDir: string | null;
  sparsePython: string;
  injectionEnabled: boolean;
  captureEnabled: boolean;
}

export interface ProbeResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  [key: string]: unknown;
}

export interface HealthResult {
  ok: boolean;
  checks: Record<string, ProbeResult>;
}

export interface MemoryHit {
  id: string;
  score: number | null;
  text: string | null;
  source: string | null;
  tags: string[];
  createdAt: string | null;
}

export interface SearchResult {
  ok: boolean;
  count: number;
  results: MemoryHit[];
  error?: string;
}

export interface StoreResult {
  ok: boolean;
  jobId?: string;
  function?: string;
  error?: string;
}
