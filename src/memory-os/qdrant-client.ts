import type { MemoryHit, ProbeResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 5000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function extractCollections(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const result = asRecord(data)["result"];
  const collections = asRecord(result)["collections"];
  return Array.isArray(collections) ? collections as Record<string, unknown>[] : [];
}

function extractSearchResults(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const result = asRecord(data)["result"];
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const points = asRecord(result)["points"];
  return Array.isArray(points) ? points as Record<string, unknown>[] : [];
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function extractMemoryText(payload: Record<string, unknown>): string | null {
  const text = payloadString(payload, "text");
  if (text) return text;

  const title = payloadString(payload, "title");
  const preview = payloadString(payload, "content_preview");
  const fallback = [title, preview].filter((value): value is string => Boolean(value)).join("\n");
  return fallback || null;
}

export async function probeQdrant(qdrantUrl: string, collection: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProbeResult> {
  const url = `${qdrantUrl.replace(/\/+$/, "")}/collections`;
  const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });

  if (!response.ok) {
    return { ok: false, statusCode: response.status, error: `probe HTTP ${response.status}` };
  }

  const collections = extractCollections(await response.json());
  const hasOurCollection = collections.some((c) => c["name"] === collection);

  return { ok: true, statusCode: response.status, hasOurCollection, collections };
}

export async function searchQdrant(
  qdrantUrl: string,
  collection: string,
  vector: number[],
  limit: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<MemoryHit[]> {
  const url = `${qdrantUrl.replace(/\/+$/, "")}/collections/${collection}/points/search`;
  const body = {
    vector: { name: "dense", vector },
    limit,
    with_payload: true,
    with_vector: false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`search HTTP ${response.status}: ${await response.text()}`);
  }

  const results = extractSearchResults(await response.json());
  return results.map((r): MemoryHit => {
    const payload = (r["payload"] ?? {}) as Record<string, unknown>;
    return {
      id: String(r["id"] ?? ""),
      score: typeof r["score"] === "number" ? r["score"] : null,
      text: extractMemoryText(payload),
      source: typeof payload["source"] === "string" ? payload["source"] : null,
      tags: Array.isArray(payload["tags"]) ? (payload["tags"] as string[]) : [],
      createdAt: typeof payload["created_at"] === "string" ? payload["created_at"] : null,
    };
  });
}
