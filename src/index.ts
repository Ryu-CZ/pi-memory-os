/**
 * pi-memory-os — Pure TypeScript Pi extension for Memory OS.
 *
 * Prerequisite: Memory OS stack running locally (Qdrant, Redis, ARQ worker,
 * llama.cpp embedding server). See /home/tom/tmp/memory-os/docker/.
 *
 * Registers 4 LLM-callable tools:
 *   memory_os_status  — health check Qdrant, Redis, embeddings, LLM bridge
 *   memory_os_store   — enqueue a memory into the ARQ ingestion pipeline
 *   memory_os_search  — dense-vector search over stored memories
 *   memory_os_reflect — trigger the ARQ reflection worker
 *
 * Hooks into lifecycle events for automatic memory:
 *   session_start       — show Memory OS connection status in Pi footer
 *   before_agent_start  — auto-search relevant context, inject as message
 *   agent_end           — auto-store assistant conclusions as durable facts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { MemoryOSClient } from "./lib/client.js";

// ── Singleton client — reused across tools and lifecycle hooks ──

const client = new MemoryOSClient();

// ── Pi extension factory ──

export default function (pi: ExtensionAPI) {
  // ..................................................................
  // Status tool
  // ..................................................................
  pi.registerTool({
    name: "memory_os_status",
    label: "Memory OS Status",
    description:
      "Check if Qdrant, Redis, embedding server, and LLM bridge " +
      "are healthy. Call this when the user asks about memory " +
      "connectivity or you need to verify the memory stack is up.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const result = await client.status();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ..................................................................
  // Store tool
  // ..................................................................
  pi.registerTool({
    name: "memory_os_store",
    label: "Memory OS Store",
    description:
      "Save a durable fact, decision, or conclusion to Memory OS. " +
      "The text is enqueued for ARQ ingestion (embedding + vector " +
      "storage). Use this when you learn something about the project, " +
      "the user, the environment, or past decisions that should be " +
      "remembered across sessions.",
    parameters: Type.Object({
      text: Type.String({
        description: "The fact, decision, or conclusion to remember",
      }),
      source: Type.Optional(
        Type.String({ description: 'Source label (default: "pi-coding-agent")' }),
      ),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Tags for filtering (e.g. decision, env, preference)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await client.store(
        params.text,
        params.source,
        params.tags,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ..................................................................
  // Search tool
  // ..................................................................
  pi.registerTool({
    name: "memory_os_search",
    label: "Memory OS Search",
    description:
      "Search durable memory for relevant context — past decisions, " +
      "project facts, environment details, user preferences. " +
      "Results are ranked by semantic similarity to the query. " +
      "Call this when you need context from previous work or you " +
      "want to ground your response in remembered facts.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query — natural language, not keywords",
      }),
      limit: Type.Optional(
        Type.Number({
          default: 5,
          description: "Max results to return (default: 5)",
        }),
      ),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description: "Filter results by tag(s)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await client.search(
        params.query,
        params.limit ?? 5,
        params.tags,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ..................................................................
  // Reflect tool
  // ..................................................................
  pi.registerTool({
    name: "memory_os_reflect",
    label: "Memory OS Reflect",
    description:
      "Trigger on-demand reflection: the ARQ worker consolidates " +
      "recent memories, finds connections, and promotes insights. " +
      "Call this after storing a batch of memories or before starting " +
      "a new task to ensure the memory graph is up to date.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const result = await client.reflect();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: {},
      };
    },
  });

  // ..................................................................
  // Lifecycle: session_start — show status in Pi footer
  // ..................................................................
  pi.on("session_start", async (_event, ctx) => {
    try {
      const status = await client.status();
      if (status.ok) {
        ctx.ui.setStatus("memory-os", "Memory OS: linked");
      } else {
        const failing = Object.entries(status.checks)
          .filter(([, v]) => !v.ok)
          .map(([k]) => k)
          .join(", ");
        ctx.ui.setStatus("memory-os", `Memory OS: ${failing} down`);
      }
    } catch {
      ctx.ui.setStatus("memory-os", "Memory OS: offline");
    }
  });

  // ..................................................................
  // Lifecycle: before_agent_start — auto-search and inject context
  // ..................................................................
  pi.on("before_agent_start", async (event, ctx) => {
    const query = event.prompt?.trim();
    if (!query) return;

    try {
      const result = await client.search(query, 3);
      if (!result.ok || result.count === 0) return;

      const block = result.results
        .map(
          (r) =>
            `[score: ${r.score?.toFixed(2) ?? "?"}]` +
            (r.source ? ` source: ${r.source}` : "") +
            (r.tags.length ? ` tags: ${r.tags.join(", ")}` : "") +
            `\n${r.text}`,
        )
        .join("\n\n---\n\n");

      return {
        message: {
          customType: "memory-os-context",
          content: `Relevant context from your durable memory:\n\n${block}`,
          display: true,
        },
      };
    } catch {
      // Memory OS unavailable — proceed without context
    }
  });

  // ..................................................................
  // Lifecycle: agent_end — auto-store assistant outcomes
  // ..................................................................
  pi.on("agent_end", async (event, ctx) => {
    try {
      const msgs = event.messages as Array<{ role: string; content?: unknown }> ?? [];
      const assistant = msgs.filter((m) => m.role === "assistant");
      const last = assistant[assistant.length - 1];
      if (!last || last.content === undefined) return;

      const text =
        typeof last.content === "string"
          ? last.content
          : JSON.stringify(last.content);

      // Only store non-trivial responses (>80 chars, not just code or acknowledgements)
      const trimmed = text.trim();
      if (trimmed.length < 80) return;

      await client.store(trimmed, "pi-agent/auto", ["auto"]);
    } catch {
      // Non-critical — silence errors so memory doesn't interfere with UX
    }
  });
}
