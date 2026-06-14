# pi-memory-os — Design

> Status: source of truth for `pi-memory-os`.
> Decision: use and adapt the existing local Memory OS as much as possible so memory on this PC lives in one Memory OS substrate.
> Dependency decision: `pi-fabric` is mandatory for `pi-memory-os`.

## Purpose

`pi-memory-os` is a Pi lifecycle adapter for the local Memory OS installation and the mandatory `pi-fabric` structured memory layer.

It is not a new Memory OS, not a Pi-only memory database, and not a default tool pack. Its job is to connect Pi to the same local memory substrate already used by Hermes/Icarus: Qdrant, Redis/ARQ, embeddings, compatible ingestion payloads, compatible schemas, and later shared corpora such as Fabric summaries.

The design bias is:

1. Reuse existing Memory OS services, queues, schemas, and corpora.
2. Adapt Pi lifecycle events to those existing interfaces.
3. Add compatibility shims only where Pi cannot call the original component safely.
4. Use `pi-fabric` for Fabric tools, schema, markdown, pending work, and structured recall.
5. Reimplement behavior only when the original behavior is inaccessible or tied to Hermes internals.

## Product Shape

Memory should be ambient. The agent should not need to remember to call a memory tool.

`pi-memory-os` owns these lifecycle behaviors:

| Pi hook | Memory OS behavior |
|---|---|
| `session_start` | Probe local Memory OS services and set Pi status |
| `before_agent_start` | Retrieve relevant memory, inject context, append Ground Truth authority instruction |
| `agent_end` | Capture durable assistant outcomes and enqueue them into the existing Memory OS ingestion path |

Memory failures must never break the Pi coding session.

## One-Substrate Rule

Memory on this PC should live in one Memory OS substrate wherever practical.

That means:

- Qdrant remains the semantic memory/search backend.
- Redis/ARQ remains the ingestion queue path.
- The existing embedding endpoint remains the vectorization path.
- Existing Memory OS payload fields and collection conventions are compatibility contracts.
- Hermes/Icarus and Pi should be able to share stored memory.
- Pi-specific code should mostly be hook glue, defensive wrappers, and format adaptation.

Avoid creating a separate Pi-only memory store unless a hard technical reason is documented.

## Relationship To Hermes/Icarus

Hermes/Icarus behavior is the compatibility reference, not something to blindly copy as user-facing Pi tools.

| Hermes/Icarus behavior | Pi adaptation |
|---|---|
| Ambient pre-call retrieval | `before_agent_start` retrieval/injection |
| Ground Truth hierarchy | Append concise authority instruction to Pi system prompt |
| Post-call/session capture | `agent_end` capture enqueue |
| Redis/ARQ ingestion | ARQ-compatible `arq:job:<id>` payload plus `arq:queue` entry |
| Qdrant semantic search | Direct Qdrant adapter using existing collection/vector conventions |
| Manual `/memory` command or memory tools | Not part of default `pi-memory-os` |

The default Pi extension surface should stay hook-only. Manual diagnostics or operator controls belong in a later opt-in admin extension.

## Relationship To pi-fabric

`~/git/pi-fabric/` owns the structured Fabric/Icarus markdown layer and is a mandatory dependency of `pi-memory-os`.

`pi-memory-os` assumes `pi-fabric` is installed and available in the same local Pi environment. This repo should coordinate with `pi-fabric`, not provide fallback Fabric implementations.

| Area | Owner | Rule |
|---|---|---|
| Fabric entry schema/frontmatter | `pi-fabric` | Do not duplicate in this repo |
| Fabric markdown corpus | `pi-fabric` | Source of truth remains markdown |
| `fabric_*` agent tools | `pi-fabric` | Keep agent-visible structured tools there |
| Fabric pending/brief/recall context | `pi-fabric` | `pi-memory-os` may consume it, not reimplement it |
| Ambient semantic memory | `pi-memory-os` | Use Qdrant/Redis/embeddings |
| Manual Memory OS diagnostics | future `pi-memory-admin` | Not default agent tools |

Integration is still allowed, but it must preserve ownership:

- `pi-memory-os` may read `pi-fabric` summaries, pending work, brief, or recall output as additional memory sources.
- `pi-memory-os` must not write Fabric markdown files.
- `pi-fabric` should not own low-level Redis/Qdrant runtime state unless a future shared client package is extracted.
- If both extensions auto-capture, captures must be tagged and deduped to avoid double-writing the same outcome.

## Non-Goals

`pi-memory-os` does not:

- expose default `memory_os_*` tools
- implement Fabric tools
- run without `pi-fabric` in the intended local setup
- replace Memory OS services
- maintain a Pi-only memory database
- write `~/git/pi-fabric/` storage files
- require manual memory calls for normal operation
- dump large memory blocks into every turn
- fail the user’s coding session when memory services are offline

## Compatibility Contracts

These are implementation contracts, not optional design ideas:

| Contract | Requirement |
|---|---|
| Qdrant probe | Parse real Qdrant envelopes such as `{ result: { collections } }` |
| Qdrant search | Parse `{ result: [...] }` and `{ result: { points: [...] } }` |
| Qdrant payload | Preserve Memory OS fields such as `text`, `source`, `tags`, `created_at` |
| Vector search | Use the configured Memory OS collection and named `dense` vector; original Memory OS also supports optional `sparse` BM25/RRF through `/points/query` |
| Embeddings | Use the configured OpenAI-compatible local endpoint |
| Embedding dimensions | Validate vectors against configured dimensions before querying Qdrant |
| Redis/ARQ | Enqueue ARQ-compatible pickle job payloads under `arq:job:<id>` and add job id to `arq:queue` |
| Pi hooks | Preserve Pi’s base system prompt and append Memory OS authority text |
| Status UI | Use Pi status API without assuming Hermes command semantics |

## Retrieval

Retrieval should be surgical:

- use the current user prompt as query
- skip low-information prompts such as bare filenames and acknowledgements
- limit result count
- enforce a minimum score
- dedupe injected IDs within a Pi session
- sanitize prompt-injection patterns and redact secrets before injection
- label source/score/tags clearly
- fail quietly

Memory noise is worse than missing memory.

Phase 1 may use dense-only Qdrant search as the compatibility baseline. A later improvement should adapt the original Memory OS `/points/query` hybrid path with dense plus sparse/RRF when the local collection supports it.

## Capture

Capture should store durable outcomes, not transcript sludge.

Capture candidates:

- decisions
- completed fixes
- stable project facts
- user preferences
- environment assumptions
- blockers with cause and next step

Do not capture:

- short acknowledgements
- generic assistant chatter
- raw logs
- secrets
- huge code dumps
- transient TODOs

The current TypeScript heuristics are acceptable only as a first adapter layer. The preferred long-term direction is to reuse the existing Memory OS/Icarus extraction path or call the same local extraction model through a compatible interface.

The Redis worker contract is `process_ingestion(ctx, memory_text, source, tags)`, so Pi should enqueue positional args `[text, source, tags]` and let the existing worker own downstream extraction/indexing where possible.

## Configuration

Configuration must point at the existing local Memory OS services:

| Variable | Purpose |
|---|---|
| `MEMORY_OS_QDRANT_URL` | Qdrant HTTP base URL |
| `MEMORY_OS_COLLECTION` | Qdrant collection |
| `MEMORY_OS_REDIS_HOST` | Redis host |
| `MEMORY_OS_REDIS_PORT` | Redis port |
| `MEMORY_OS_REDIS_PASSWORD` | Redis password, if needed |
| `MEMORY_OS_EMBEDDING_API_BASE` | OpenAI-compatible embedding base URL |
| `MEMORY_OS_EMBEDDING_MODEL` | embedding model |
| `MEMORY_OS_EMBEDDING_DIMS` | vector dimensions |
| `MEMORY_OS_SOURCE` | source label for Pi captures |
| `MEMORY_OS_MIN_SCORE` | retrieval threshold |
| `MEMORY_OS_MAX_RESULTS` | per-turn memory limit |
| `MEMORY_OS_INJECTION_ENABLED` | enable ambient injection |
| `MEMORY_OS_CAPTURE_ENABLED` | enable ambient capture |

Injection and capture must be independently disableable.

## Success Criteria

The implementation is correct when:

1. Pi registers lifecycle hooks and no default memory tools.
2. `session_start` reports Memory OS health without throwing.
3. Meaningful prompts retrieve relevant existing Qdrant memories.
4. Low-information prompts do not trigger memory injection.
5. Injected memory appends to Pi’s system prompt instead of replacing it.
6. Captures enqueue into the existing Memory OS ARQ worker path.
7. Redis/Qdrant/embedding failures are quiet and non-fatal.
8. Hermes/Icarus and Pi remain compatible at the storage/protocol level.
9. `pi-fabric` is installed and remains the structured markdown/tool surface.
10. Any future duplication is justified by an inaccessible original component.

## Future Work

Near-term:

- run live smoke tests against local Qdrant, embeddings, Redis, and ARQ worker
- compare current payload fields against the original Memory OS extractor/indexer
- add prompt-injection sanitization for retrieved memories
- validate embedding vector dimensions before Qdrant search
- evaluate adapting original `/points/query` hybrid search after dense-only smoke passes
- add a worker-consumption smoke check, not just Redis enqueue verification
- document and implement coordination policy when mandatory `pi-fabric` and `pi-memory-os` both auto-capture

Later:

- read-only Fabric summaries as an additional memory source
- shared low-level clients only after real duplication appears
- optional `pi-memory-admin` for manual diagnostics
- reuse local Memory OS extraction/scoring paths more deeply

## Mantra

One local memory substrate.
Adapt before rebuilding.
Retrieve before thinking.
Store only what matters.
Stay quiet when memory is unavailable.
