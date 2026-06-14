import { sanitizeMemoryText } from "../policy/redaction.js";
import type { MemoryHit } from "../types.js";

function formatHit(hit: MemoryHit): string | null {
  const text = hit.text?.trim();
  if (!text) return null;

  return (
    `[qdrant score: ${hit.score?.toFixed(2) ?? "?"}]` +
    (hit.source ? ` source: ${hit.source}` : "") +
    (hit.tags.length ? ` tags: ${hit.tags.join(", ")}` : "") +
    (hit.createdAt ? ` created_at: ${hit.createdAt}` : "") +
    `\n${sanitizeMemoryText(text)}`
  );
}

export function formatMemoryContext(hits: MemoryHit[]): string {
  const body = hits.map(formatHit).filter((value): value is string => Boolean(value)).join("\n\n---\n\n");
  return `Relevant context from Memory OS:\n\n${body}`;
}
