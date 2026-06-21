# AI Analysis & Quality Score — Plan Brief

> Full plan: `context/changes/ai-analysis-score/plan.md`

## What & Why

S-02 adds AI photo analysis to Omnilister AI: GPT-4o Vision scores each photo on 8 quality
dimensions and detects the object's category and features. This unblocks S-03 (the north-star
slice) — S-03 calls S-02's `scorePhoto()` module function inline to compute before/after score
deltas for transformed images. Without S-02, S-03 cannot prove the product hypothesis.

## Starting Point

F-01 is done: `quality_scores` table (8 NUMERIC dimensions + `overall_score` + `is_sales_ready`),
`objects` table (with `category` column, no `features_text` yet), and `photos` table are all
present. Auth is live. `aiConfig` and `scoringConfig` exist in `src/lib/config.ts` but `aiConfig`
has no vision model key. `QualityScoreSnapshot` type exists in `src/types/transformations.ts`.
No product API routes or pages exist yet. S-01 is not planned — Phases 3–4 of this plan are
blocked until it is.

## Desired End State

A user selects photos on the object detail page, clicks "Analyze selected", and within ~10–30 s
sees an 8-dimension score grid per photo with a sales-readiness badge, an editable AI-proposed
category, and an editable free-text features description. `scorePhoto()` is exported from
`src/lib/quality-scoring.ts` and callable by S-03's background processor.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Analysis trigger | Explicit "Analyze" button | User controls when API cost is incurred; avoids scoring incomplete photo sets | Plan |
| Photo scope | User-selected photos (checkboxes) | Gives cost/scope control; aligns with S-03's photo-selection pattern | Plan |
| GPT-4o call structure | Single call per photo, structured JSON output | 1 API call = lowest cost and latency; JSON schema enforces consistent 0–10 scores | Plan |
| Scoring weights | Equal weights (1/8 each) + per-category stubs in `scoringConfig` | MVP doesn't need calibrated weights; stubs enable future tuning without code changes | Plan |
| Overall score formula | Arithmetic mean of 8 dimensions, rounded to 2 dp | Simple, reproducible, matches `NUMERIC(4,2)` column precision | Plan |
| Feature detection | Free-text description in `objects.features_text` (new column) | No structured per-category fields needed for any MVP flow; editable textarea satisfies FR-004 | Plan |
| Async pattern | Synchronous response (no polling) | GPT-4o Vision completes in ~10–30 s, well under the 60 s NFR that motivated S-03's polling | Plan |
| UI placement | Analysis section on S-01's object detail page | One page for the full object view; component built independently, integrated when S-01 ships | Plan |
| Error handling | Retry up to `aiConfig.maxRetries`, then per-photo error + Retry button | Reuses existing retry constant; surfaces failure at highest-context moment | Plan |
| S-01 dependency | Wait for S-01 plan; Phases 1–2 unblocked | Phases 1–2 (config, types, scoring module) need no S-01 shapes; Phases 3–4 do | Plan |

## Scope

**In scope:**
- `aiConfig.visionModel` key + `scoringConfig.categoryWeights` stubs in `src/lib/config.ts`
- `src/types/analysis.ts` — scoring request/response TypeScript types + Zod schemas
- DB migration: `objects.features_text TEXT` column
- `src/lib/quality-scoring.ts` — `scorePhoto()` + `analyzeObject()` module functions
- Unit tests for scoring logic (mocked GPT-4o)
- 3 API routes: POST `/analyze`, GET `/quality-scores/photo/[photoId]`, PATCH `/category`
- `AnalysisSection` React island (photo checkboxes + score grid + category + features + error states)
- Integration into S-01's object detail page (contract defined here; S-01 renders the island)

**Out of scope:**
- Object creation / photo upload / gallery (S-01)
- Transformation flow (S-03)
- Global style library (S-04)
- Per-category scoring weight calibration (post-MVP)
- GDPR consent modal before first AI call (faza 2)
- Async polling for analysis (GPT-4o Vision is fast enough for sync)

## Architecture / Approach

```
Browser (React island: AnalysisSection)
  │ POST /api/objects/[objectId]/analyze  { photo_ids }
  │ ← { category, features_text, scores: QualityScoreSnapshot[] }
  │
  │ PATCH /api/objects/[objectId]/category  { category, features_text? }
  │ GET  /api/quality-scores/photo/[photoId]   ← S-03 calls this
  ▼

Astro API route
  └── analyzeObject(objectId, photoIds, supabase, userId)
        ├── fetch photos from DB → generate signed URLs
        └── Promise.all( scorePhoto(signedUrl, category) × N )
              ├── OpenRouter openai/gpt-4o → structured JSON
              ├── INSERT quality_scores row
              └── return QualityScoreSnapshot

Background (ctx.waitUntil — S-03 only):
  └── scorePhoto(result_url, category)   ← called inline after transformation
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Config, Types & Migration | `visionModel` + weight stubs + analysis types + `objects.features_text` column | `supabase db reset` must apply all prior migrations + new one cleanly |
| 2. Scoring Core Module | `scorePhoto()` + `analyzeObject()` + unit tests | GPT-4o structured output requires correct JSON schema in system prompt; miscalibrated prompt = inconsistent 0–10 scores |
| 3. API Routes | POST analyze, GET score, PATCH category | S-03 depends on `GET /api/quality-scores/photo/[photoId]` contract; shape must match exactly |
| 4. Analysis UI Component | React island with selection, scoring, category/features edit, error states | Integration requires S-01's object detail page to exist; blocked until S-01 is implemented |

**Prerequisites:** F-01 done (it is). S-01 must be planned and implemented before Phases 3–4 can
be fully tested. Phases 1–2 can start now.

**Estimated effort:** ~2–3 focused sessions across 4 phases. Phase 2 (scoring module) is the
heaviest (~40% of effort — prompt engineering + unit tests). Phases 1 and 3 are ~20% each.
Phase 4 (UI) is ~20% but blocked on S-01.

## Open Risks & Assumptions

- `photos.original_url` semantics are unknown until S-01 is planned: if it stores a storage path
  (not a URL), Phase 3's `analyzeObject()` must generate a fresh signed URL before calling
  `scorePhoto()` — assumed and noted in the plan, to be confirmed against S-01's contract
- GPT-4o structured output with `response_format: { type: "json_schema" }` is required to lock
  scores to 0–10; plain JSON mode produces inconsistent ranges
- Equal weights may produce misleading overall scores for niche photos (e.g., macro shots where
  `angle_coverage` is irrelevant) — acceptable for MVP validation
- If Cloudflare enforces a ~30 s edge response timeout (undocumented for Workers), the synchronous
  analyze route would need to switch to `ctx.waitUntil` + polling pattern (mirroring S-03)

## Success Criteria (Summary)

- `scorePhoto(signedUrl, 'car')` returns a valid `QualityScoreSnapshot` and writes a `quality_scores`
  row — verifiable without S-01
- POST `/api/objects/[objectId]/analyze` populates `objects.category`, `objects.features_text`,
  and `quality_scores` for all selected photos
- S-03's `GET /api/quality-scores/photo/[photoId]` returns pre-computed scores with the correct shape
