# pi-memory-os

**Pi lifecycle adapter** that bridges [Pi](https://github.com/earendil-works/pi-coding-agent), mandatory local `pi-fabric`, and an existing [Memory OS](https://github.com/ClaudioDrews/memory-os) installation — automatic retrieval, injection, and capture with no default Memory OS tools.

## What it is

`pi-memory-os` is a thin TypeScript Pi extension that hooks Pi's session lifecycle to Memory OS services (Qdrant, Redis/ARQ, embeddings) and coordinates with `pi-fabric` for the structured Fabric layer. It makes memory ambient:

- **Before the agent reasons**, relevant prior context is retrieved and injected into the prompt.
- **After useful work**, durable outcomes are captured and enqueued for ingestion.
- **On session start**, Memory OS health is checked passively and reported in the Pi footer.
- **When Memory OS is offline**, Pi continues normally with graceful degradation.

The agent never needs to ask "should I search memory?" — memory is already part of the session lifecycle.

## What it is NOT

- **Not a Memory OS replacement.** Memory OS remains the system of record. This repo only connects Pi to it.
- **Not a Fabric reimplementation.** Structured cross-session entries (decisions, tasks, reviews, handoffs) belong to mandatory [`pi-fabric`](https://github.com/Ryu-CZ/pi-fabric).
- **Not a default tool pack.** No `memory_os_search`, `memory_os_store`, `memory_os_status`, or `memory_os_reflect` tools are exposed by default. Memory is infrastructure, not a tool the model calls.

## Relationship to pi-fabric

| Project | Owns | Does not own |
|---|---|---|
| `pi-memory-os` | Pi-to-Memory-OS adapter; lifecycle hooks; ambient retrieval/injection; Qdrant/Redis/embedding integration; Ground Truth injection | Fabric entries, Fabric tools, admin/debug tools |
| [`pi-fabric`](https://github.com/Ryu-CZ/pi-fabric) | Structured cross-session entries, Fabric-compatible markdown store, decisions/tasks/reviews/workflows | Low-level Qdrant/Redis adapter, ambient injection |

`pi-memory-os` answers: *"What context should Pi remember right now?"*  
`pi-fabric` answers: *"What structured work/decision record should exist across agents?"*

`pi-fabric` is a required dependency of `pi-memory-os`. Load both in the same local Pi environment. `pi-memory-admin` (future) would own diagnostics and manual operator controls.

## Install

```bash
git clone git@github.com:Ryu-CZ/pi-memory-os.git
cd pi-memory-os
npm install
npm run build
```

This repo expects `../pi-fabric` to exist for local development through the `file:../pi-fabric` package dependency. If your checkout layout differs, update the local dependency path before running `npm install`.

Enable the extension in your Pi configuration by referencing `./src/index.ts` (or `./dist/index.js` for built output). The `package.json` already declares the extension under the `"pi"` field:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

## Configuration

All configuration is via environment variables. Defaults assume a local Memory OS installation on `127.0.0.1`.

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_OS_QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant HTTP base URL |
| `MEMORY_OS_COLLECTION` | `knowledge_base` | Qdrant collection name |
| `MEMORY_OS_REDIS_HOST` | `127.0.0.1` | Redis host |
| `MEMORY_OS_REDIS_PORT` | `6379` | Redis port |
| `MEMORY_OS_REDIS_PASSWORD` | *(none)* | Redis password (empty = none) |
| `MEMORY_OS_EMBEDDING_API_BASE` | `http://127.0.0.1:7485/v1` | OpenAI-compatible embeddings base URL |
| `MEMORY_OS_EMBEDDING_MODEL` | `qwen3-embed-0.6b` | Embedding model name |
| `MEMORY_OS_EMBEDDING_DIMS` | `1024` | Embedding vector dimensions |
| `MEMORY_OS_SOURCE` | `pi-coding-agent` | Source label for entries written by Pi |
| `MEMORY_OS_MIN_SCORE` | `0.35` | Minimum retrieval score for injection |
| `MEMORY_OS_MAX_RESULTS` | `3` | Maximum injected memories per turn |
| `MEMORY_OS_INJECTION_ENABLED` | `true` | Enable/disable automatic retrieval & injection |
| `MEMORY_OS_CAPTURE_ENABLED` | `true` | Enable/disable automatic outcome capture |

Injection and capture can be disabled independently. Set either to `false`, `0`, `no`, or `off` to disable.

## Lifecycle Hooks

The extension registers exactly three Pi lifecycle hooks — no tools:

### `session_start`

Probes Qdrant, Redis, and the embedding endpoint. Sets the Pi footer:

- **All healthy** → `Memory OS: linked`
- **Partial failure** → `Memory OS: <failing-service-names>`
- **Exception** → `Memory OS: offline`

Clears the per-session injected-memory dedupe set.

### `before_agent_start`

Before the agent reasons on a prompt:

1. Skips retrieval for low-information prompts (bare filenames, acknowledgements, short commands).
2. Embeds the prompt and searches Qdrant for relevant memories.
3. Filters hits by minimum score, emptiness, and per-session deduplication.
4. Formats hits with source labels, scores, and tags.
5. Injects a Ground Truth instruction telling the agent how to treat injected memory vs live tool output.
6. Returns the formatted context as a hidden message and appends the authority rule to the system prompt.

### `agent_end`

After the agent finishes:

1. Extracts the last assistant message.
2. Runs it through the capture policy (rejects short text, acknowledgements, secrets).
3. Redacts sensitive fields (API keys, passwords, tokens).
4. Enqueues the result to the Memory OS Redis/ARQ ingestion queue (`process_ingestion`).
5. Swallows all errors — capture failure must never alter the final answer.

## Smoke Verification

After building, verify connectivity to your local Memory OS:

```bash
# Check all services (Qdrant, Redis, embeddings)
npm run smoke:health

# Search Qdrant with a natural language query
npm run smoke:search "what did we decide about pi-memory-os boundaries?"

# Prove the ARQ worker consumes a Pi-enqueued job without writing Qdrant
npm run smoke:arq

# Enqueue a harmless ingestion probe and wait for the worker to index it
npm run smoke:ingest

# Run Pi through two lifecycle prompts
npm run smoke:pi
```

`smoke:health` prints a redacted JSON summary of all service probes. `smoke:search` embeds the query, searches Qdrant, and prints the top hits with scores, sources, and tags. `smoke:arq` enqueues a non-destructive whitespace job and waits for the worker to consume it. `smoke:ingest` writes one clearly labeled local smoke probe through `process_ingestion`, then polls Qdrant until the worker-indexed result appears. `smoke:pi` runs the real Pi CLI through a bare filename prompt and a memory-relevant prompt.

If you use the local Memory OS Docker setup, source its Redis password into the Pi adapter environment before live smokes:

```bash
set -a
. /path/to/memory-os/docker/.env
set +a
export MEMORY_OS_REDIS_PASSWORD="$REDIS_PASSWORD"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Memory OS: offline` footer | All probes failed or threw | Ensure Qdrant, Redis, and embedding services are running locally |
| `Memory OS: qdrant` footer | Qdrant unreachable or collection missing | Check `MEMORY_OS_QDRANT_URL` and that the collection exists |
| `Memory OS: redis` footer | Redis not running or auth failed | Verify `MEMORY_OS_REDIS_HOST`, `MEMORY_OS_REDIS_PORT`, `MEMORY_OS_REDIS_PASSWORD` |
| `Memory OS: embeddings` footer | Embedding endpoint down | Check `MEMORY_OS_EMBEDDING_API_BASE` and that the local model server is running |
| No memory injected during turns | Injection disabled or no relevant hits | Verify `MEMORY_OS_INJECTION_ENABLED=true`; run `smoke:search` to confirm data exists |
| Nothing captured after turns | Capture disabled or output too short | Verify `MEMORY_OS_CAPTURE_ENABLED=true`; check `smoke:health` for Redis connectivity |
| `npm run smoke:health` exits 1 | One or more services unreachable | Read stderr for specific failure details; check service logs |
| `npm run smoke:arq` times out | ARQ worker is not consuming jobs from this Redis | Check worker process and Redis connection settings |
| `npm run smoke:ingest` times out | ARQ worker is not consuming jobs or Qdrant indexing failed | Check Memory OS worker logs and Redis queue state |
| `npm run smoke:pi` fails with session/settings errors | Pi cannot write its normal runtime files | Run outside a read-only sandbox so Pi can write under `~/.pi` |
| TypeScript errors on build | Missing dependencies | Run `npm install` then `npm run build` |

All hook failures are non-fatal. If Memory OS is unavailable, Pi continues with no memory context — the coding session is never broken.

---

## License

MIT
