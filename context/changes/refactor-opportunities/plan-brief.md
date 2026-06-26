# Refactor Opportunities — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

Three high-ROI structural fixes identified in the refactor-opportunities research. The app currently shows a hardcoded mock quality score (5.8) to every user on every photo — a live misinformation bug. A separate route uses a brittle URL-slicing pattern to compute storage paths, violating a documented team rule. And saved transformation images expire silently after 24h, making the save feature worthless for returning users.

## Starting Point

The quality scoring infrastructure (vision LLM → `quality_scores` table → GET endpoint) already exists and works; it was simply never wired to the editor's "before" display. The storage path rule was written *because* of the existing brittle pattern. The `transformed-photos` bucket is private with a deterministic path formula already in the code.

## Desired End State

Selecting a photo in EditorShell triggers a cheap LLM call (once) and shows real quality metrics in "Ocena przed"; subsequent selects are instant from DB cache. Photo deletion reliably removes the correct file. Saved transformations remain viewable indefinitely via a refresh endpoint that re-signs the path on demand.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Score computation method | Cheap vision LLM (`gemini-2.0-flash-lite`) | Only approach that fills all 8 semantic fields without changing UI or types | Plan |
| Cache strategy for scoreBefore | Any existing `quality_scores` row is valid (no TTL) | Original photo is immutable after upload; re-scoring is wasteful | Plan |
| SSIM/MSE before→after | Deferred | Meaningful display requires UI additions outside this plan's scope | Plan |
| Storage path reconstruction | `${user.id}/${objectId}/${fileName}` | Trusted values; eliminates fragility; follows `lessons.md:19–23` | Research |
| Signed URL fix approach | Opcja B: store path + refresh endpoint | Preserves private bucket; reversible; no public URL accumulation risk | Research |
| `result-url` refresh model | Always call endpoint on render | Simpler than expiry detection; add caching if latency matters | Plan |

## Scope

**In scope:**
- `aiConfig.previewModel` config key
- Optional `model` param on `scorePhoto` / `_callGptVision`
- `POST /api/quality-scores/photo/[photoId]` — on-demand scoring with cache
- EditorShell `scoreBefore` state + useEffect fetch flow
- Remove `MOCK_SCORE_BEFORE` from `mockEditorData.ts`
- Fix `slice(-3)` → trusted-value reconstruction in `photos/[photoId].ts`
- DB migration: `result_storage_path TEXT` on `transformations`
- Write `result_storage_path` in `transformation-processor.ts`
- `GET /api/transformations/[jobId]/result-url` refresh endpoint
- Wire refresh endpoint at saved-result render callsite(s)

**Out of scope:**
- Supabase service layer (C-1) — test coverage prerequisite
- EditorShell hook extraction (C-4) — test coverage prerequisite
- Double ownership check removal (C-6)
- Race condition Supabase RPC (C-7)
- SSIM/MSE client-side computation
- BRISQUE/NIQE pure-JS implementation
- CI test step wiring

## Architecture / Approach

Three independent, sequentially verified phases. Phase 1 adds a new POST handler to the existing quality-scores route file (Astro supports multiple HTTP method exports per file); EditorShell adds a single `useEffect` with a GET-then-POST fetch pattern. Phase 2 is a 1-line code fix after a DB format verification query. Phase 3 is an additive DB migration + minimal processor update + new API file.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. C-3 Quality scoring | Real "Ocena przed" scores on photo select; mock 5.8 removed | LLM call latency on first select (~2–5s); mitigated by instant cache on repeat |
| 2. C-5 Storage path | Photo delete removes correct file; `lessons.md` rule satisfied | Pre-migration rows with non-public `original_url` format (verify DB before coding) |
| 3. C-8 URL durability | Saved transformations viewable after 24h+ | NULL `result_storage_path` on existing rows (handled by 404 fallback to stale URL) |

**Prerequisites:** Supabase project access (for migration in Phase 3); ability to verify DB format (Phase 2 prereq).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Gemini 2.0 Flash Lite supports the `response_format: json_schema` parameter used by `_callGptVision` — verify on first deploy; fallback: use `anthropic/claude-haiku-4-5`.
- `analyzeObject` passes `photo.original_url` (a full public URL) as a storage path to `createSignedUrl` — latent bug, silently falls back. This plan does not fix it; do not introduce the same pattern.
- EditorShell's guest-mode detection: verify the exact flag/check before wiring the `useEffect` guard.

## Success Criteria (Summary)

- "Ocena przed" panel shows real, per-photo quality scores — never 5.8 — within seconds of photo selection.
- Deleting a photo removes the file from Supabase storage (confirmed via dashboard).
- A saved transformation's result image renders correctly on page reload 25+ hours after saving.
