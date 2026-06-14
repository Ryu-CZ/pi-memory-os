import type { MemoryHit, SearchResult } from "../types.js";

export interface RetrievalSource {
  label: string;
  search: (query: string, limit: number) => Promise<MemoryHit[]>;
}

function labelHit(hit: MemoryHit, label: string): MemoryHit {
  const source = hit.source?.trim() || label;
  return { ...hit, source };
}

function roundRobin(groups: MemoryHit[][]): MemoryHit[] {
  const merged: MemoryHit[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let i = 0; i < maxLength; i += 1) {
    for (const group of groups) {
      const hit = group[i];
      if (hit) merged.push(hit);
    }
  }
  return merged;
}

export async function aggregateRetrieval(
  sources: RetrievalSource[],
  query: string,
  limit: number,
): Promise<SearchResult> {
  const groups = await Promise.all(
    sources.map(async (source) => {
      try {
        const hits = await source.search(query, limit);
        return hits.map((hit) => labelHit(hit, source.label));
      } catch {
        return [];
      }
    }),
  );

  const results = roundRobin(groups);
  return { ok: results.length > 0, count: results.length, results };
}
