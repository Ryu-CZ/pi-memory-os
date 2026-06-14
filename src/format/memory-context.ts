import { sanitizeMemoryText } from "../policy/redaction.js";
import type { MemoryHit } from "../types.js";

export interface FabricBriefLike {
  fabric_dir?: unknown;
  agent?: unknown;
  pending?: {
    open_tasks?: unknown;
    reviews_of_my_work?: unknown;
    open_tickets?: unknown;
    total?: unknown;
    first_items?: Array<{ id?: unknown; summary?: unknown; file?: unknown }>;
  };
  recent_own?: Array<{ id?: unknown; type?: unknown; summary?: unknown; file?: unknown }>;
  recent_others?: Array<{ id?: unknown; agent?: unknown; type?: unknown; summary?: unknown; file?: unknown }>;
  suggested_next_action?: unknown;
}

function formatHit(hit: MemoryHit): string | null {
  const text = hit.text?.trim();
  if (!text) return null;

  const source = hit.source?.trim() || "memory";

  return (
    `[${source} score: ${hit.score?.toFixed(2) ?? "?"}]` +
    (hit.tags.length ? ` tags: ${hit.tags.join(", ")}` : "") +
    (hit.createdAt ? ` created_at: ${hit.createdAt}` : "") +
    `\n${sanitizeMemoryText(text)}`
  );
}

export function formatMemoryContext(hits: MemoryHit[]): string {
  const body = hits.map(formatHit).filter((value): value is string => Boolean(value)).join("\n\n---\n\n");
  return `Relevant context from Memory OS:\n\n${body}`;
}

function line(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return `${label}: ${sanitizeMemoryText(String(value), 240)}`;
}

function itemLine(prefix: string, item: { id?: unknown; agent?: unknown; type?: unknown; summary?: unknown; file?: unknown }): string | null {
  const summary = sanitizeMemoryText(String(item.summary ?? ""), 240);
  if (!summary) return null;
  const meta = [item.agent, item.type, item.id, item.file].filter(Boolean).map((v) => sanitizeMemoryText(String(v), 80));
  return `- ${prefix}${meta.length ? ` (${meta.join(" / ")})` : ""}: ${summary}`;
}

export function formatFabricBrief(brief: FabricBriefLike): string {
  const pending = brief.pending ?? {};
  const sections = [
    "Fabric operational brief:",
    line("agent", brief.agent),
    line("fabric_dir", brief.fabric_dir),
    `pending: total=${pending.total ?? 0}, open_tasks=${pending.open_tasks ?? 0}, reviews=${pending.reviews_of_my_work ?? 0}, tickets=${pending.open_tickets ?? 0}`,
    line("suggested_next_action", brief.suggested_next_action),
  ].filter((value): value is string => Boolean(value));

  const firstItems = (pending.first_items ?? []).map((item) => itemLine("pending", item)).filter((value): value is string => Boolean(value));
  if (firstItems.length) sections.push("first pending items:", ...firstItems.slice(0, 5));

  const recentOwn = (brief.recent_own ?? []).map((item) => itemLine("own", item)).filter((value): value is string => Boolean(value));
  if (recentOwn.length) sections.push("recent own Fabric activity:", ...recentOwn.slice(0, 5));

  const recentOthers = (brief.recent_others ?? []).map((item) => itemLine("other", item)).filter((value): value is string => Boolean(value));
  if (recentOthers.length) sections.push("recent other Fabric activity:", ...recentOthers.slice(0, 5));

  return sections.join("\n");
}
