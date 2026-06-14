import type { MemoryHit } from "../types.js";

export type RetrievalSourceKind = "fabric" | "qdrant" | "hermes-sessions" | "hermes-facts";

export interface RetrievalSourcePolicy {
  maxResults: number;
  minScore: number | null;
}

export interface RetrievalFilterOptions {
  minScore: number;
  maxResults: number;
  sourcePolicies?: Partial<Record<RetrievalSourceKind, RetrievalSourcePolicy>>;
}

const DEFAULT_SOURCE_POLICIES: Record<RetrievalSourceKind, RetrievalSourcePolicy> = {
  fabric: { maxResults: 2, minScore: null },
  qdrant: { maxResults: 2, minScore: 0.35 },
  "hermes-sessions": { maxResults: 2, minScore: null },
  "hermes-facts": { maxResults: 2, minScore: null },
};

export function shouldSkipMemoryQuery(query: string): boolean {
  const normalized = query.trim();
  const lower = normalized.toLowerCase();

  if (normalized.length < 8) return true;
  if (/^[\w./~-]+\.[a-z0-9]+$/i.test(normalized)) return true;
  if (/^(readme|license|package|tsconfig|docker-compose)(\.[a-z0-9]+)?$/i.test(normalized)) return true;
  if (/^(ok|okay|thanks|thank you|yes|no|yep|nope|continue|go on|proceed)$/i.test(lower)) return true;

  return false;
}

export function injectionDedupeKey(hit: MemoryHit): string {
  return hit.source ? `${hit.source}:${hit.id}` : hit.id;
}

function sourceKind(hit: MemoryHit): RetrievalSourceKind {
  if (hit.source === "pi-fabric" || hit.id.startsWith("fabric:") || hit.tags.includes("fabric")) return "fabric";
  if (hit.source === "hermes-sessions" || hit.id.startsWith("hermes-session:")) return "hermes-sessions";
  if (hit.source === "hermes-facts" || hit.id.startsWith("hermes-fact:")) return "hermes-facts";
  return "qdrant";
}

function sourcePolicy(kind: RetrievalSourceKind, options: RetrievalFilterOptions): RetrievalSourcePolicy {
  if (options.sourcePolicies?.[kind]) return options.sourcePolicies[kind];
  if (kind === "qdrant") return { ...DEFAULT_SOURCE_POLICIES.qdrant, minScore: options.minScore };
  return DEFAULT_SOURCE_POLICIES.fabric;
}

export function filterInjectableHits(
  hits: MemoryHit[],
  alreadyInjected: Set<string>,
  options: RetrievalFilterOptions,
): MemoryHit[] {
  const counts: Record<RetrievalSourceKind, number> = { fabric: 0, qdrant: 0, "hermes-sessions": 0, "hermes-facts": 0 };
  const results: MemoryHit[] = [];

  for (const hit of hits) {
    if (results.length >= options.maxResults) break;
    if (alreadyInjected.has(injectionDedupeKey(hit))) continue;
    if (hit.text === null || hit.text.trim().length === 0) continue;

    const kind = sourceKind(hit);
    const policy = sourcePolicy(kind, options);
    if (counts[kind] >= policy.maxResults) continue;
    if (policy.minScore !== null && hit.score !== null && hit.score < policy.minScore) continue;

    counts[kind] += 1;
    results.push(hit);
  }

  return results;
}
