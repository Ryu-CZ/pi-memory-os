import type { MemoryHit } from "../types.js";

export interface RetrievalFilterOptions {
  minScore: number;
  maxResults: number;
}

export function shouldSkipMemoryQuery(query: string): boolean {
  const normalized = query.trim();
  const lower = normalized.toLowerCase();

  if (normalized.length < 8) return true;
  if (/^[\w./~-]+\.[a-z0-9]+$/i.test(normalized)) return true;
  if (/^(readme|license|package|tsconfig|docker-compose)(\.[a-z0-9]+)?$/i.test(normalized)) return true;
  if (/^(ok|okay|thanks|thank you|yes|no|yep|nope|continue|go on|proceed)$/i.test(lower)) return true;

  return false;
}

export function filterInjectableHits(
  hits: MemoryHit[],
  alreadyInjected: Set<string>,
  options: RetrievalFilterOptions,
): MemoryHit[] {
  return hits
    .filter((hit) => !alreadyInjected.has(hit.id))
    .filter((hit) => hit.text !== null && hit.text.trim().length > 0)
    .filter((hit) => hit.score === null || hit.score >= options.minScore)
    .slice(0, options.maxResults);
}
