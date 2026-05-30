# AI Transformation Session — Plan Brief

> Full plan: `context/changes/ai-transformation-session/plan.md`

## What & Why

S-03 is the north-star slice of Omnilister AI: the smallest complete end-to-end flow that proves the product hypothesis. The user selects photos, picks a transformation style, and gets AI-improved versions with a measurable before/after quality score — the core value proposition in one session. Without S-03, the product is only infrastructure; S-03 is the proof that it works.

## Starting Point

Auth is live (email/password, Supabase SSR, protected routes). The codebase has `aiConfig`, `storageConfig`, and `scoringConfig` constants ready in `src/lib/config.ts`, plus a reusable UI component set. There is no product DB schema, no Storage integration, no AI calls, and no product pages — S-03 builds the first end-to-end product flow on top of three planned prerequisites (F-01, S-01, S-02).

## Desired End State

A logged-in user opens an object, selects 1–N photos, picks a preset style (or types a custom prompt), and triggers transformation. Draft previews appear within ~5 seconds; full results within ~60 seconds. Each result is shown side-by-side with the original photo and quality scores (before → after). The user rates each result (improved / not improved), selects which to keep, and saved transformed photos appear in the object's library.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| AI model for transformation | `openai/gpt-image-1` via OpenRouter | Edits the original photo rather than replacing it — directly satisfies the no-distortion guardrail; routed through OpenRouter for unified API access | Plan |
| Async pattern (draft 5s / full 60s) | Client polling every 2s against a status endpoint | Simple on Cloudflare Workers via `ctx.waitUntil()` — no queues, no Durable Objects needed | Plan |
| Style selection UX | Category-specific hardcoded presets + optional custom prompt override | Works without S-04 (global library); gives non-experts a starting point while satisfying FR-010 | Plan |
| Before/after comparison | Side-by-side with summary score delta + expandable 8-dimension breakdown | Immediately proves value numerically; expandable breakdown avoids overwhelming the comparison view | Plan |
| Multi-photo handling | User selects subset of photos, applies one style to the batch | Gives the user cost/scope control; aligns with FR-012 (choose which to save) | Plan |
| Session persistence | Jobs persisted in `transformations` DB table; resume on refresh | No lost work if browser crashes mid-60s job; clean state machine | Plan |
| Error handling | `status='failed'` + Retry button; max retries from `aiConfig.maxRetries` (=2) | Uses the already-configured constant; gives user a clear action without silent loss | Plan |
| Feedback UX | Inline thumbs per transformation result before save | Collected at highest-context moment; stores per `transformations` row | Plan |
| Prerequisite contracts | Define exact DB columns, Storage paths, API shapes — don't re-implement | Keeps S-03 plannable now while leaving F-01/S-01/S-02 unconstrained | Plan |

## Scope

**In scope:**
- `transformations` DB table schema (spec for F-01 to include)
- TypeScript types + Zod schemas for transformation data
- 9 hardcoded preset styles (3 per category: car, real-estate, item)
- 4 API routes: POST `/start`, GET `/status`, POST `/[jobId]/save`, POST `/[jobId]/feedback`
- OpenAI `gpt-image-1` integration (draft + full calls, retries)
- Re-scoring transformed images via S-02's `scorePhoto` function
- `/objects/[objectId]/transform` session page + React island
- Side-by-side before/after with score delta, expandable breakdown, inline feedback, save confirmation

**Out of scope:**
- Global style library (S-04)
- Quality scoring algorithm (S-02)
- Photo upload / object creation (S-01)
- DB schema and Storage buckets (F-01)
- GDPR consent flow (faza 2)
- Notifications, background job queues, Durable Objects

## Architecture / Approach

```
Browser (React island)
  │ POST /api/transformations/start
  │ ← { job_ids }
  │ (waitUntil fires background processor)
  │
  │ GET /api/transformations/status?ids=… (every 2s)
  │ ← [ { status, draft_url, result_url, score_after } ]
  │
  │ POST /api/transformations/[jobId]/feedback
  │ POST /api/transformations/[jobId]/save
  ▼

Cloudflare Worker
  └── waitUntil(processTransformationBatch)
        ├── gpt-image-1 draft call → Supabase Storage draft.jpg → DB draft_ready
        └── gpt-image-1 full call  → Supabase Storage full.jpg  → DB full_ready
                                    → scorePhoto(result_url)     → DB score_after
```

Key constraint: S-02 must export `scorePhoto()` as a module function (not only an HTTP route) so the transformation processor can call it inline inside `waitUntil` without an extra HTTP round-trip.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data Contracts & Schema | TypeScript types, Zod schemas, preset styles, `transformations` table spec, prerequisite interface contracts | F-01/S-01/S-02 may diverge from the contracts defined here if those plans are written without referencing this doc |
| 2. Backend — Transformation API | 4 API routes + OpenAI client + background processor | `waitUntil` not called → silent failure; 60s OpenAI calls inside a Worker require all I/O to be async (no blocking) |
| 3. Frontend — Session UI | Full session page: photo selector → style picker → polling job cards → save confirmation | Polling interval and tab visibility handling are easy to get wrong; mobile side-by-side layout needs explicit testing |

**Prerequisites:** F-01 (`db-schema-storage`), S-01 (`object-and-photo-upload`), S-02 (`ai-analysis-score`) must all be implemented before Phase 2 manual tests are possible. Phase 1 can be done now.

**Estimated effort:** ~3–4 focused sessions across 3 phases. Phase 1 is ~1 session (types + config). Phase 2 is ~1.5 sessions (API + OpenAI integration). Phase 3 is ~1.5 sessions (UI components + polling logic).

## Open Risks & Assumptions

- `gpt-image-1` size options for draft are unverified — if the model doesn't support sub-1024 sizes, fall back to `dall-e-2` for draft and accept a longer draft latency (5s NFR may slip to 10–15s)
- The 5-second draft NFR depends on OpenAI API response times, which are outside our control
- Re-scoring via `scorePhoto()` after transformation adds latency inside the background job — if S-02's scoring takes >10s, the `full_ready` state may appear late despite the image being ready sooner
- F-01 must implement storage-usage tracking (byte counter) for the storage limit guard in POST `/save` to work
- S-02 must export `scorePhoto` as a module function; if it only provides an HTTP route, the processor must make an internal HTTP call (adds ~100–300ms per job)

## Success Criteria (Summary)

- Draft previews appear within ~5s; full results within ~60s for all selected photos (NFR)
- `score_after.overall > score_before.overall` for at least the "clean background" category presets on typical product photos (primary PRD success criterion)
- User feedback (improved / not improved) is recorded per transformation and retrievable from the DB after the session
