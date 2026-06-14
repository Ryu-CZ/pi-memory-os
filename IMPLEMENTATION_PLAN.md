# pi-memory-os Implementation Plan

This is the single tracking document for what is done, what is planned, and what the current task is.

Stable design decisions live in `DESIGN.md`. Operational usage lives in `README.md`.

## Current Task

**Task:** design sync before more implementation: keep `pi-memory-os` aligned with the original local Memory OS as glue, then implement session-start Fabric operational context next.

Status:

- [x] Design sync completed: current code still follows the one-substrate/glue principle, with gaps now reprioritized.
- [x] Hybrid Qdrant `/points/query` support added with dense `/points/search` fallback.
- [x] Live `smoke:search` and `smoke:lifecycle-context` pass after Hybrid Qdrant Search integration.
- [x] Live retrieval aggregator check confirms one injected context can include both `pi-fabric` and Qdrant/Memory OS results.
- [x] `npm run smoke:pi` passes after aggregator integration.
- [x] Compare current adapter behavior with original local Memory OS.
- [x] Compare overlap with `~/git/pi-fabric`.
- [x] Update design docs so `pi-fabric` is mandatory, not optional.
- [x] Update package metadata so local development depends on `../pi-fabric`.
- [x] Remove stale root-level planning/thinking fragments.
- [x] Verify package/docs consistency.
- [x] Design the aggregator interfaces and source labels.
- [x] Add mandatory `pi-fabric` source integration.
- [x] Preserve Qdrant source behavior.
- [x] Add tests for aggregation, source-local failure, and dedupe.

## Decisions

| Decision | Status | Notes |
|---|---:|---|
| Use one local Memory OS substrate on this PC | accepted | Reuse local Qdrant, Redis/ARQ, embeddings, and compatible payloads. |
| `pi-memory-os` is a Pi lifecycle adapter | accepted | It owns hook glue, retrieval injection, capture enqueue, health, and Memory OS protocol adaptation. |
| `pi-fabric` is mandatory for `pi-memory-os` | accepted | Fabric context/tools/schema are provided by `pi-fabric`; `pi-memory-os` coordinates with it instead of duplicating it. |
| No default `memory_os_*` tools | accepted | Manual diagnostics belong in a future admin surface. |
| Fabric markdown writes stay in `pi-fabric` | accepted | `pi-memory-os` must not create or mutate Fabric markdown files directly. |
| Dense `/points/query` is the current Qdrant baseline | accepted for now | Sparse/BM25 must reuse the original Memory OS sparse path; do not invent a Pi-only sparse index. |

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
| Session-start context equivalent to Icarus SOUL/pending/recent/creative state | mostly `pi-fabric`, some Memory OS | Promote next: use `pi-fabric` brief/pending/recent APIs for Fabric parts; do not duplicate markdown readers. |
| Structured whole-session archival | `pi-fabric` for markdown, Memory OS worker for Qdrant | Decide capture routing so the same useful outcome is not double-stored. |
| Hermes durable fact store `memory_store.db` | `pi-memory-os` read-only adapter | Added optional read-only SQLite fact retrieval when the DB exists. |
| Session history FTS over Hermes state DB | `pi-memory-os` read-only adapter | Added optional read-only SQLite session retrieval when the DB exists. |
| Retrieval telemetry/provenance | `pi-memory-os` documents; Hermes owns its telemetry files | Documented as deferred: local Hermes telemetry exists, but Pi must not write Hermes runtime telemetry in this phase. |
| Full ARQ enqueue surface for non-ingestion jobs | future admin surface | Keep current adapter narrow unless Memory OS needs more worker jobs from Pi lifecycle. |

## Planned Work

Priority order from design sync:

1. Stabilize `pi-fabric` public programmatic APIs, then update `pi-memory-os` imports away from `pi-fabric/dist/src/...`.
2. Add session-start / first-turn Fabric operational context using `pi-fabric` brief/pending/recent APIs.
3. Define retrieval per-source budgets and score policy.
4. Design capture coordination between semantic Memory OS ingestion and structured `pi-fabric` capture.
5. Add read-only Hermes session/fact sources.
6. Only then revisit sparse/BM25 hybrid retrieval after confirming the original Memory OS sparse embedding path.

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
- Verified live on 2026-06-14:
  - `npm run build`
  - `npm run smoke:search "what did we decide about pi-memory-os boundaries?"` returned Qdrant hits.
  - Direct `handleBeforeAgentStart` check returned hidden `memory-os-context` with both `[pi-fabric score: ...]` and `[pi-coding-agent score: ...]` blocks.
  - `npm run smoke:pi` completed successfully for low-information and boundary prompts.
  - `npm run smoke:lifecycle-context` now repeats the dual-source hidden-context assertion through `handleBeforeAgentStart`.

Follow-up tasks discovered during implementation and live verification:

- [x] Run live Pi lifecycle verification and confirm one injected context can include both `pi-fabric` recall results and Qdrant Memory OS results.
- [x] Add a repeatable scripted lifecycle-context verifier (`npm run smoke:lifecycle-context`) — runs `handleBeforeAgentStart` through real sources and asserts dual-source hidden context labels.
- [x] Document the current manual/live aggregator verification method in README or scripts.
- [x] Review `pi-fabric` import stability: current code imports stable public exports from `pi-fabric`, not `pi-fabric/dist/src/...`.
- [x] Decide whether the Fabric source should include `brief()`/pending operational context in addition to query recall; Task 5 keeps operational brief in `session_start` and query recall in `before_agent_start` to avoid duplicating markdown readers.
- [x] Re-verify Fabric hit text quality after model/tooling tweaks; live recall still surfaced truncated JSON/thinking-like summaries, so `pi-memory-os` now normalizes Fabric JSON summaries and suppresses thinking-only summaries.
- [x] Clarify Qdrant source-label expectations: Qdrant hits preserve payload source labels such as `[pi-coding-agent score: ...]`; `qdrant` is only the retrieval source label/fallback.
- [x] Review score-scale interaction because Fabric lexical scores and Qdrant similarity scores shared the same `minScore` filter; Task 6 now applies source-specific policy.
- [x] Consider lightweight retrieval observability/provenance for source-local failures; Task 10 documents telemetry constraints and defers writes until a valid sink/admin surface exists.

### 3. Hybrid Qdrant Search

Classification: `adapt`

Goal: match original Memory OS preferred retrieval path more closely.

Tasks:

- [x] Add `/points/query` support using named dense vector.
- [x] Add optional sparse/BM25 query support only when a local sparse embedding path is available; no local sparse embedding path is configured yet, so dense query remains the implemented path.
- [x] Keep dense-only fallback through legacy `/points/search`.
- [x] Keep response parsing for both direct list and `{ result: { points } }` envelopes.

Verification:

- [x] Unit tests cover query body and fallback.
- [x] `smoke:search` works against the local collection.
- [x] `smoke:lifecycle-context` confirms lifecycle retrieval still combines Fabric and Qdrant/Memory OS after switching the Qdrant source to `/points/query`.

Follow-up tasks discovered during implementation:

- [x] Confirm the exact sparse/BM25 embedding source before adding sparse query branches; Task 11 found no local sparse embedding path, so sparse query branches are deferred.

### 4. Stable pi-fabric Programmatic API

Classification: `reuse/enabler`

Goal: let `pi-memory-os` consume Fabric recall/brief/pending/recent through stable `pi-fabric` exports instead of built internal paths.

Tasks:

- [x] Add or use stable `pi-fabric` public exports for config loading, `FabricStore`, recall/scoring, and brief/pending/recent access.
- [x] Update `pi-memory-os` imports away from `pi-fabric/dist/src/...`.
- [x] Keep `fabric_*` tool registration exclusively in `pi-fabric`; do not re-register tools here.
- [x] Add typecheck/test coverage for the public import path.

Verification:

- [x] `pi-memory-os` builds against stable `pi-fabric` imports.
- [x] `npm run verify` passed in `pi-memory-os` (typecheck + 17 files / 105 tests).
- [x] `pi-fabric` `npm test` passed after API export changes (16 tests).

### 5. Session-start Fabric Operational Context

Classification: `adapt/reuse`

Goal: restore the Icarus-style session-start operational brief in Pi while keeping `pi-fabric` the owner of Fabric storage and scoring.

Tasks:

- [x] Call `pi-fabric` brief/pending/recent APIs from `pi-memory-os`; do not read Fabric markdown directly here.
- [x] Preserve current Memory OS health footer behavior.
- [x] Decide the Pi lifecycle shape: session_start returns a hidden `fabric-operational-context` message.
- [x] Include pending work, reviews, tickets, recent activity, and suggested next action where available.
- [x] Keep context concise and sanitized via shared Memory OS redaction helpers.
- [x] Add unit tests for session-start Fabric operational context.
- [x] Add/update a smoke/verifier for live session-start Fabric operational context (`npm run smoke:lifecycle-context`).

Verification:

- [x] Unit tests prove Fabric brief failures are non-fatal.
- [x] Live smoke shows session-start context includes Fabric operational brief when data exists.
- [x] No `fabric_*` tools or Fabric markdown readers are duplicated in `pi-memory-os`.

### 6. Retrieval Budget and Score Policy

Classification: `adapt/design-first`

Goal: prevent one retrieval source from crowding out others and avoid applying one score scale blindly across Fabric lexical scores, Qdrant similarity, sessions, and facts.

Tasks:

- [x] Define per-source limits and a global cap.
- [x] Decide score policy: `MEMORY_OS_MIN_SCORE` is the default Qdrant similarity threshold; Fabric lexical scores are not filtered on that scale.
- [x] Keep source-aware dedupe.
- [x] Preserve concise output and fail-open behavior.

Implemented policy:

- Hidden retrieval injection keeps a global `MEMORY_OS_MAX_RESULTS` cap.
- Fabric hits use a source budget of 2 and no default score threshold.
- Qdrant/Memory OS semantic hits use a source budget of 2 and default to `MEMORY_OS_MIN_SCORE` unless an explicit source policy is supplied.
- Fabric identification is source-aware (`pi-fabric` source, `fabric:` IDs, or `fabric` tags), so Qdrant payload source labels such as `pi-coding-agent` are not mistaken for Fabric.

Verification:

- [x] Unit tests show Fabric and Qdrant can both survive filtering when both have relevant hits.
- [x] Tests cover low-scoring Qdrant without accidentally filtering valid Fabric operational context.
- [x] `npm run verify` passed.
- [x] `npm run build` passed.

### 7. Capture Coordination

Classification: `adapt`

Goal: avoid duplicate capture when both mandatory `pi-fabric` and `pi-memory-os` observe `agent_end`.

Policy:

- [x] `pi-fabric` owns structured decision/task/review markdown.
- [x] `pi-memory-os` owns semantic ingestion into Memory OS via ARQ.
- [x] Shared tags/source fields identify Pi Memory OS captures.
- [x] If both capture the same assistant outcome, downstream systems have enough metadata to distinguish them.

Implemented policy:

- Keep both captures enabled by default because they serve complementary destinations: semantic Qdrant retrieval vs structured Fabric markdown.
- Do not suppress `pi-memory-os` capture when `FABRIC_AUTO_STORE` is on.
- Tag `pi-memory-os` ARQ captures with `memory-os-capture` and `source_tool:pi-memory-os` in addition to `auto`, `pi`, and `agent_end`.
- Document that `pi-fabric` `FABRIC_AUTO_STORE` defaults on; operators can disable `MEMORY_OS_CAPTURE_ENABLED` for Fabric-only capture or `FABRIC_AUTO_STORE` for Memory-OS-only capture.

Verification:

- [x] Unit tests assert the `memory-os-capture` and `source_tool:pi-memory-os` tags are present on accepted captures and enqueued agent-end jobs.
- [x] README documents dual capture behavior and disable switches.

### 8. Optional Read-Only Hermes DB Sources

Classification: `adapt`

Add only read-only readers:

- [x] `~/.hermes/state.db` / configured Hermes state DB for prior sessions.
- [x] `~/.hermes/memory_store.db` / configured Hermes memory store for durable facts.

Rules:

- [x] No writes to Hermes SQLite from this repo.
- [x] Missing DBs are normal.
- [x] Query failures are non-fatal.

Implemented policy:

- `HERMES_STATE_DB` and `HERMES_MEMORY_STORE_DB` default to the local Hermes paths; setting either env var to an empty string disables that source.
- Hermes sources use the local `sqlite3` CLI with `-readonly -json`; no SQLite write statements are issued.
- Session hits search `messages_fts` and map to `source: "hermes-sessions"`, `id: "hermes-session:<id>"`, `score: null`, and `hermes/session` tags.
- Fact hits search `facts_fts` and map to `source: "hermes-facts"`, `id: "hermes-fact:<id>"`, `score: trust_score`, and `hermes/fact` tags.
- Hermes scores/trust values are not treated as Qdrant similarity scores; both Hermes sources use no default score threshold and have source budgets.

Verification:

- [x] Unit tests cover missing DB skip, session row mapping, fact row mapping, and source-local SQLite failures.
- [x] Retrieval policy tests cover Hermes source score handling.
- [x] README documents Hermes DB configuration.
- [x] Live read-only check against local `~/.hermes/state.db` returned `hermes-sessions` hits; `~/.hermes/memory_store.db` is currently empty and returned no fact hits.
- [x] `npm run verify` passed.
- [x] `npm run build` passed.

Follow-up tasks discovered during implementation:

- [ ] Add a dedicated live Hermes smoke script if Hermes DB availability becomes a supported operator check.
- [ ] Revisit Hermes session ranking/noise filtering after observing real injected context; current source filters out tool-role messages but still relies on recency ordering.

### 9. Repo Hygiene Before Commit

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

Current hygiene review:

- [x] Removed temporary Hermes scouting note from repo root.
- [x] No generated `dist/` files are shown in `git status --short`.
- [x] No `.pi/` files are shown in `git status --short`.
- [x] Remaining untracked files are source/scripts/tests from current and prior implementation slices, not disposable temp notes.
- [x] `npm run verify` passed.
- [x] `npm run build` passed.

### 10. Retrieval Observability / Provenance

Classification: `design-first`

Goal: make source-local retrieval failures and per-source hit counts inspectable without noisy user-facing output.

Rules:

- [x] Document desired telemetry/provenance first.
- [x] Keep source failures non-fatal.
- [x] Do not expose noisy default tools; any operator UI belongs in future admin surface.
- [x] Prefer structured internal metadata/logging only if it maps to an available local telemetry target.

Findings:

- Local Hermes telemetry exists at `~/.hermes/logs/query-telemetry.jsonl`.
- `pi-fabric/HANDOFF.md` explicitly says Pi should not mutate Hermes runtime state, including telemetry files, in phase 1.
- Current `aggregateRetrieval()` intentionally keeps source failures local and silent; `SearchResult` has no source breakdown consumer yet.
- Adding source hit/error metadata now would create a new Pi-only convention without an approved telemetry sink or admin surface.

Decision:

- [x] Defer telemetry writes and user-facing retrieval diagnostics.
- [x] Keep fail-open retrieval behavior unchanged.
- [x] Revisit when a shared telemetry package or opt-in `pi-memory-admin` surface exists.

### 11. Sparse/BM25 Hybrid Follow-up

Classification: `design-first/reuse`

Goal: revisit sparse/BM25 hybrid retrieval only after identifying the original local Memory OS sparse embedding path.

Findings:

- Local Qdrant collection `knowledge_base` now defines dense vector `dense` (4096, cosine) and sparse vector `sparse` (IDF modifier), matching the original Hermes/Memory OS standard.
- Initial live scroll before the worker fix showed only `dense` vectors populated; after the worker and Qdrant migration, all 17 local points include both `dense` and `sparse` vectors.
- Local embedding service now exposes dense model `qwen3-embedding-8b` through llama.cpp with 4096-dimensional embeddings.
- Follow-up handoff patched the local Memory OS worker so ARQ ingestion and reflection now generate FastEmbed `Qdrant/bm25` sparse vectors and upsert `{"dense": vector, "sparse": sparse_vector}` when sparse succeeds.
- Verification from the worker handoff created point `a34700df-e24d-40d4-8fd3-4382bef09b9c` with `vector_keys=['dense', 'sparse']`, dense length 4096, and 16 sparse indices/values.

Implemented policy:

- [x] Add optional sparse query vector generation that reuses the local Memory OS worker container's FastEmbed BM25 path (`MEMORY_OS_SPARSE_DOCKER_DIR`, `MEMORY_OS_SPARSE_PYTHON`).
- [x] Use Qdrant `/points/query` dense+sparse prefetch with RRF fusion when sparse query generation succeeds.
- [x] Keep dense `/points/query` and legacy `/points/search` fallback when sparse generation or hybrid query fails.
- [x] Do not invent a Pi-only sparse index or separate collection.

Verification:

- [x] Unit tests cover hybrid Qdrant request shape and Qdrant source sparse handoff.
- [x] Live sparse query generation through `/home/tom/tmp/memory-os/docker` returned FastEmbed sparse indices/values.
- [x] Full live hybrid retrieval smoke passed with dense length 4096, sparse query vector generated, and Qdrant returning the sparse verification points through RRF.
- [x] `npm run verify` passed.
- [x] `npm run build` passed.

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

Task 11 is now unblocked and implemented after the local Memory OS worker began writing sparse vectors. Next action is final completion audit and commit preparation: review diffs and decide commit boundaries for prior-session changes.
