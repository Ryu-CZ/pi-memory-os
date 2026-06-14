import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { MemoryHit } from "../types.js";
import type { RetrievalSource } from "./aggregator.js";

const execFileAsync = promisify(execFile);
const SQLITE_TIMEOUT_MS = 3000;

interface HermesSessionRow {
  id?: unknown;
  content?: unknown;
  role?: unknown;
  timestamp?: unknown;
  title?: unknown;
  session_source?: unknown;
}

interface HermesFactRow {
  fact_id?: unknown;
  content?: unknown;
  category?: unknown;
  tags?: unknown;
  trust_score?: unknown;
  created_at?: unknown;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function ftsQuery(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 8) ?? [];
  if (!tokens.length) return null;
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  return null;
}

function parseJsonRows<T>(stdout: string): T[] {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function sqliteJson<T>(dbPath: string, sql: string): Promise<T[]> {
  const result = await execFileAsync("sqlite3", ["-readonly", "-json", dbPath, sql], {
    timeout: SQLITE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  const stdout = typeof result === "string" ? result : result.stdout;
  return parseJsonRows<T>(stdout);
}

function existingDbPath(dbPath: string | null): string | null {
  if (!dbPath || !existsSync(dbPath)) return null;
  return dbPath;
}

function trimText(text: string, maxLength = 1200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function createHermesSessionsSource(dbPath: string | null): RetrievalSource | null {
  const path = existingDbPath(dbPath);
  if (!path) return null;

  return {
    label: "hermes-sessions",
    async search(query, limit) {
      try {
        const match = ftsQuery(query);
        if (!match) return [];
        const sql = `
          SELECT m.id, m.content, m.role, m.timestamp, s.title, s.source AS session_source
          FROM messages_fts fts
          JOIN messages m ON m.id = fts.rowid
          JOIN sessions s ON s.id = m.session_id
          WHERE messages_fts MATCH ${sqlString(match)}
            AND m.active = 1
            AND m.content IS NOT NULL
            AND TRIM(m.content) <> ''
            AND m.role IN ('user', 'assistant')
          ORDER BY m.timestamp DESC
          LIMIT ${Math.max(0, Math.trunc(limit))}
        `;
        const rows = await sqliteJson<HermesSessionRow>(path, sql);
        return rows.flatMap((row): MemoryHit[] => {
          const id = asNumber(row.id);
          const content = asString(row.content);
          if (id === null || !content) return [];
          const title = asString(row.title);
          const role = asString(row.role);
          const sessionSource = asString(row.session_source);
          const prefix = [title ? `session: ${title}` : null, role ? `role: ${role}` : null].filter(Boolean).join("\n");
          return [{
            id: `hermes-session:${id}`,
            score: null,
            text: prefix ? `${prefix}\n${trimText(content)}` : trimText(content),
            source: "hermes-sessions",
            tags: ["hermes", "session", role, sessionSource].filter((tag): tag is string => Boolean(tag)),
            createdAt: asTimestamp(row.timestamp),
          }];
        });
      } catch {
        return [];
      }
    },
  };
}

export function createHermesFactsSource(dbPath: string | null): RetrievalSource | null {
  const path = existingDbPath(dbPath);
  if (!path) return null;

  return {
    label: "hermes-facts",
    async search(query, limit) {
      try {
        const match = ftsQuery(query);
        if (!match) return [];
        const sql = `
          SELECT f.fact_id, f.content, f.category, f.tags, f.trust_score, f.created_at
          FROM facts_fts fts
          JOIN facts f ON f.fact_id = fts.rowid
          WHERE facts_fts MATCH ${sqlString(match)}
          ORDER BY f.trust_score DESC, f.updated_at DESC
          LIMIT ${Math.max(0, Math.trunc(limit))}
        `;
        const rows = await sqliteJson<HermesFactRow>(path, sql);
        return rows.flatMap((row): MemoryHit[] => {
          const id = asNumber(row.fact_id);
          const content = asString(row.content);
          if (id === null || !content) return [];
          const category = asString(row.category);
          const rowTags = asString(row.tags)?.split(/[,\s]+/).filter(Boolean) ?? [];
          return [{
            id: `hermes-fact:${id}`,
            score: asNumber(row.trust_score),
            text: trimText(content),
            source: "hermes-facts",
            tags: ["hermes", "fact", category, ...rowTags].filter((tag): tag is string => Boolean(tag)),
            createdAt: asTimestamp(row.created_at),
          }];
        });
      } catch {
        return [];
      }
    },
  };
}
