# pi-memory-os

**Pi extension** bridging TypeScript coding agents to [Memory OS](https://github.com/ClaudioDrews/memory-os) — a local, layered memory stack.

Agents (Pi, Hermes, any LLM with tool access) gain durable, searchable memory through 4 tools and automatic lifecycle hooks.

---

## Prerequisites

[Memory OS](https://github.com/ClaudioDrews/memory-os) stack running locally:

| Service | Default | Purpose |
|---------|---------|---------|
| Qdrant | `127.0.0.1:6333` | Vector storage / dense search |
| Redis | `127.0.0.1:6379` | ARQ job queue (ingestion, reflection) |
| llama.cpp embeddings | `127.0.0.1:7485` | OpenAI-compatible `/v1/embeddings` |
| ARQ worker | (runs in Docker) | Processes ingestion + reflection jobs |

The llama.cpp embedding server must serve an OpenAI-compatible embeddings endpoint.  
Example (Tom's setup): `/mnt/m2-games/ai/local_model/qwen35_27_code/scripts/run_server/embed.sh`

---

## Install

### Global (all Pi sessions)

```bash
git clone git@github.com:Ryu-CZ/pi-memory-os.git ~/.pi/agent/extensions/memory-os
cd ~/.pi/agent/extensions/memory-os && npm install
```

### Project-local

```bash
git clone git@github.com:Ryu-CZ/pi-memory-os.git .pi/extensions/memory-os
cd .pi/extensions/memory-os && npm install
```

Pi auto-discovers extensions in both locations. `/reload` picks up changes at runtime.

---

## Tools

| Tool | Description |
|------|-------------|
| `memory_os_status` | Probe Qdrant, Redis, embeddings, and LLM bridge health |
| `memory_os_store` | Enqueue an ARQ `process_ingestion` job (text → embedding → Qdrant) |
| `memory_os_search` | Dense vector search over stored memories (query → embed → Qdrant) |
| `memory_os_reflect` | Trigger ARQ `process_reflection` (consolidates recent memories) |

Each tool returns structured JSON. The agent decides when to call each one based on tool descriptions in the system prompt.

---

## Automatic hooks

| Event | What happens |
|-------|-------------|
| `session_start` | Health check — shows "Memory OS: linked" or "offline" in Pi's footer |
| `before_agent_start` | Extracts keywords from user prompt → searches 3 most relevant memories → injects as context message |
| `agent_end` | Auto-stores assistant responses >80 chars as durable facts (tagged `auto`) |

Hooks are non-blocking. If Memory OS is down, the agent proceeds without memory.

---

## Configuration via environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_OS_QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant HTTP URL |
| `MEMORY_OS_COLLECTION` | `knowledge_base` | Qdrant collection name |
| `MEMORY_OS_REDIS_HOST` | `127.0.0.1` | Redis host |
| `MEMORY_OS_REDIS_PORT` | `6379` | Redis port |
| `MEMORY_OS_REDIS_PASSWORD` | (empty) | Redis password |
| `MEMORY_OS_EMBEDDING_API_BASE` | `http://127.0.0.1:7485/v1` | OpenAI-compatible embedding endpoint |
| `MEMORY_OS_EMBEDDING_MODEL` | `qwen3-embed-0.6b` | Model name sent to embedding API |
| `MEMORY_OS_EMBEDDING_DIMS` | `1024` | Embedding dimension |
| `MEMORY_OS_SOURCE` | `pi-coding-agent` | Default source label for stored memories |
| `MEMORY_OS_LLM_API_BASE` | `http://127.0.0.1:7486/v1` | LLM bridge health check URL |

---

## Architecture

```
Pi agent session
  │
  │── pi-memory-os extension (TypeScript)
  │     ├── 4 registered tools (status / store / search / reflect)
  │     ├── session_start      → health footer
  │     ├── before_agent_start → auto-inject relevant memories
  │     └── agent_end          → auto-store conclusions
  │
  ├── HTTP  ──► llama.cpp embedding server (7485)
  ├── HTTP  ──► Qdrant REST API (6333)
  └── Redis ──► ARQ job queue (6379)
                    │
                    ▼
              Memory OS ARQ worker
              (ingestion → embedding → Qdrant upsert)
              (reflection → memory consolidation)
```

No Python runtime required. The extension communicates with Memory OS services directly via HTTP and Redis.

---

## Development

```bash
git clone git@github.com:Ryu-CZ/pi-memory-os.git
cd pi-memory-os
npm install
npx tsc --noEmit --skipLibCheck   # type-check
```

---

## License

MIT
