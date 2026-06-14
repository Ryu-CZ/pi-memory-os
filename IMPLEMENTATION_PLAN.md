# pi-memory-os Implementation Plan

This is the single tracking document for what is done, what is planned, and what the current task is.

Stable design decisions live in `DESIGN.md`. Operational usage lives in `README.md`.

## Current Task

**Task:** implement the retrieval aggregator so `pi-memory-os` can combine mandatory `pi-fabric` context with Qdrant memory, and later read-only Hermes session/fact sources, without duplicating Fabric storage or tools.

Status:

- [x] Compare current adapter behavior with original local Memory OS.
- [x] Compare overlap with `~/git/pi-fabric`.
- [x] Update design docs so `pi-fabric` is mandatory, not optional.
- [x] Update package metadata so local development depends on `../pi-fabric`.
- [x] Remove stale root-level planning/thinking fragments.
- [x] Verify package/docs consistency.
- [ ] Design the aggregator interfaces and source labels.
- [ ] Add mandatory `pi-fabric` source integration.
- [ ] Preserve Qdrant source behavior.
- [ ] Add tests for aggregation, source-local failure, and dedupe.

## Decisions

| Decision | Status | Notes |
|---|---:|---|
| Use one local Memory OS substrate on this PC | accepted | Reuse local Qdrant, Redis/ARQ, embeddings, and compatible payloads. |
| `pi-memory-os` is a Pi lifecycle adapter | accepted | It owns hook glue, retrieval injection, capture enqueue, health, and Memory OS protocol adaptation. |
| `pi-fabric` is mandatory for `pi-memory-os` | accepted | Fabric context/tools/schema are provided by `pi-fabric`; `pi-memory-os` coordinates with it instead of duplicating it. |
| No default `memory_os_*` tools | accepted | Manual diagnostics belong in a future admin surface. |
| Fabric markdown writes stay in `pi-fabric` | accepted | `pi-memory-os` must not create or mutate Fabric markdown files directly. |
| Dense Qdrant search is the current baseline | accepted for now | Hybrid dense+sparse `/points/query` is planned. |

## Done

Implementation currently present in `pi-memory-os`:

- TypeScript Pi extension registering `session_start`, `before_agent_start`, and `agent_end`.
- Passive Memory OS health check on session start.
- Hidden ambient Qdrant memory injection before agent start.
- Ground Truth authority instruction appended to Pi's existing system prompt.
- Capture from final assistant output on `agent_end`.
- Redis/ARQ enqueue to existing Memory OS worker function `process_ingestion(ctx, memory_text, source, tags)`.
- OpenAI-compatible embedding client with configured dimension validation.
- Qdrant client that parses real Qdrant response envelopes and maps Memory OS payload fields.
- Prompt-injection sanitization and secret redaction for injected memory.
- Capture filtering for short text, acknowledgements, and heavily redacted output.
- Smoke scripts for health, search, ARQ consumption, ingestion, and Pi lifecycle.
- Vitest coverage for hooks, config, health, embedding, Qdrant, Redis/ARQ, policies, context formatting, and extension surface.

Verified previously:

- `npm run verify`
- `npm run build`
- live local Memory OS smokes with Redis password exported from the local Memory OS Docker env:
  - `npm run smoke:health`
  - `npm run smoke:search "what did we decide about pi-memory-os boundaries?"`
  - `npm run smoke:arq`
  - `npm run smoke:ingest`
  - `npm run smoke:pi`

## Already Owned By pi-fabric

These are mandatory dependencies, not work to recreate here:

- Fabric markdown storage and frontmatter schema.
- Icarus-compatible Fabric entry validation and atomic markdown writes.
- `fabric_write`, `fabric_recall`, `fabric_search`, `fabric_pending`, `fabric_curate`, `fabric_brief`, and `fabric_init_obsidian`.
- Fabric filesystem recall/scoring.
- Fabric directory resolution through `FABRIC_DIR` and Pi settings.
- Fabric pending/review/brief lifecycle context.
- Optional Fabric auto-store of decision-like assistant output.

`pi-memory-os` may call or coordinate with these capabilities, but direct Fabric ownership remains in `pi-fabric`.

## Missing Versus Original Local Memory OS

| Gap | Owner | Plan |
|---|---|---|
| Multi-source retrieval: Fabric + Qdrant + sessions + facts | `pi-memory-os` coordinates; `pi-fabric` owns Fabric source | Add a retrieval aggregator that treats `pi-fabric` as mandatory and keeps Qdrant/session/fact sources labeled. |
| Hybrid Qdrant retrieval with dense+sparse BM25/RRF | `pi-memory-os` | Add `/points/query` path with dense fallback; keep live smoke coverage. |
| Session-start context equivalent to Icarus SOUL/pending/recent/creative state | mostly `pi-fabric`, some Memory OS | Use `pi-fabric` brief/pending for Fabric parts; do not duplicate markdown readers. |
| Structured whole-session archival | `pi-fabric` for markdown, Memory OS worker for Qdrant | Decide capture routing so the same useful outcome is not double-stored. |
| Hermes durable fact store `memory_store.db` | `pi-memory-os` read-only adapter | Add read-only SQLite fact retrieval if the DB exists. |
| Session history FTS over Hermes state DB | `pi-memory-os` read-only adapter | Add read-only SQLite session retrieval if the DB exists. |
| Retrieval telemetry/provenance | undecided | Document first; implement only if original telemetry target is available locally. |
| Full ARQ enqueue surface for non-ingestion jobs | future admin surface | Keep current adapter narrow unless Memory OS needs more worker jobs from Pi lifecycle. |

## Planned Work

### 1. Make pi-fabric Mandatory

Classification: `adapt`

Tasks:

- Add `pi-fabric` as a local package dependency.
- Update README and design text from "both optional extensions" to "`pi-memory-os` requires `pi-fabric`".
- Document load order and collision policy.
- Keep `fabric_*` tools in `pi-fabric`; do not re-register them in this repo.

Verification:

- `package.json` and lockfile include `pi-fabric`.
- README and DESIGN no longer describe `pi-fabric` as optional.
- `npm run verify` passes.

### 2. Retrieval Aggregator

Classification: `adapt/reuse`

Goal: restore original Memory OS multi-source behavior without copying `pi-fabric`.

Sources:

- `pi-fabric` recall/brief for Fabric context.
- Qdrant semantic memory from Memory OS.
- Optional Hermes session DB reader.
- Optional Hermes fact DB reader.

Rules:

- Every source is labeled.
- All injected text is sanitized.
- Per-session dedupe remains source-aware.
- Failures are source-local and non-fatal.
- Fabric markdown is never written by this repo.

Verification:

- Unit tests cover aggregation, source labeling, failures, and dedupe.
- Pi lifecycle smoke shows Qdrant memory and Fabric context can coexist.

### 3. Hybrid Qdrant Search

Classification: `adapt`

Goal: match original Memory OS preferred retrieval path more closely.

Tasks:

- Add `/points/query` support using named dense vector.
- Add optional sparse/BM25 query support only when a local sparse embedding path is available.
- Keep dense-only fallback.
- Keep response parsing for both direct list and `{ result: { points } }` envelopes.

Verification:

- Unit tests cover query body and fallback.
- `smoke:search` works against the local collection.

### 4. Capture Coordination

Classification: `adapt`

Goal: avoid duplicate capture when both mandatory `pi-fabric` and `pi-memory-os` observe `agent_end`.

Planned policy:

- `pi-fabric` owns structured decision/task/review markdown.
- `pi-memory-os` owns semantic ingestion into Memory OS via ARQ.
- Shared tags/source fields must identify Pi captures.
- If both capture the same assistant outcome, downstream dedupe should have enough metadata to collapse or distinguish them.

Open implementation question:

- Whether to default `FABRIC_AUTO_STORE` on or off when `pi-memory-os` capture is enabled. Since `pi-fabric` is mandatory, this should be explicit in README before changing behavior.

### 5. Optional Read-Only Hermes DB Sources

Classification: `adapt`

Add only read-only readers:

- `~/.hermes/state.db` / configured Hermes state DB for prior sessions.
- `~/.hermes/memory_store.db` / configured Hermes memory store for durable facts.

Rules:

- No writes to Hermes SQLite from this repo.
- Missing DBs are normal.
- Query failures are non-fatal.

### 6. Repo Hygiene Before Commit

Classification: `pi-specific`

Keep:

- `DESIGN.md`
- `IMPLEMENTATION_PLAN.md`
- `README.md`
- `src/`
- `tests/`
- `scripts/`
- package metadata and lockfile

Do not commit unless intentionally needed:

- `.pi/`
- generated `dist/`
- temporary mission notes
- root-level thinking fragments

Verification before commit:

```bash
git status --short
npm run verify
npm run build
```

## Do-Not-Build List

Do not add these to `pi-memory-os`:

- `fabric_*` tools.
- Fabric schema/frontmatter writers.
- Fabric markdown search/scoring.
- Default `memory_os_search`, `memory_os_store`, `memory_os_status`, or `memory_os_reflect` tools.
- A Pi-only memory database.
- A separate Qdrant collection for Pi without a documented hard reason.
- Admin queue inspection commands.

Manual/admin memory controls belong in a future opt-in admin extension.

## Current Next Step

Start Task 2: implement the retrieval aggregator so `pi-memory-os` can combine mandatory `pi-fabric` context with Qdrant memory, and later read-only Hermes session/fact sources, without duplicating Fabric storage or tools.
