# AI Analysis & Quality Score Implementation Plan

## Overview

Implements S-02 — AI-powered photo analysis for Omnilister AI. After uploading photos (S-01),
the user selects one or more photos and clicks "Analyze". The app calls GPT-4o Vision (via
OpenRouter) with a structured-output prompt that returns, in one call per photo: the detected
object category, free-text features description, and scores on 8 quality dimensions. Scores are
written to the `quality_scores` table; the object's `category` and `features_text` are updated
on first analysis. The key deliverable is the `scorePhoto()` module function that S-03 calls
inline inside its `ctx.waitUntil` background processor.

## Current State Analysis

As of 2026-05-31:
- `quality_scores` table exists (F-01 done) with 8 NUMERIC(4,2) dimension columns, `overall_score`,
  `is_sales_ready`; append-only (no `updated_at`)
- `objects` table has `category TEXT CHECK (category IN ('car','real-estate','item'))` — nullable
  (filled by S-02); no `features_text` column yet
- `photos` table has `id`, `user_id`, `object_id`, `original_url`, `thumbnail_url`, `file_size_bytes`
- `aiConfig` in `src/lib/config.ts` has `transformationModel: "openai/gpt-image-1"` but no vision
  model key; `OPENROUTER_API_KEY` is the only AI credential
- `scoringConfig` has `salesReadinessThreshold: 7`, `maxScore: 10`, `categories` but no per-category
  weight map
- `QualityScoreSnapshot` interface already exists in `src/types/transformations.ts`
- No product pages, no product API routes, no AI calls exist yet

## Desired End State

A logged-in user opens an object, selects photos with checkboxes, and clicks "Analyze selected".
After a spinner (typically 10–30 s), each selected photo shows an 8-dimension score grid, an
overall score, and a sales-readiness badge (green "Ready to publish" / amber "Needs improvement").
The object's AI-proposed category appears above the photos with an inline dropdown to confirm or
change it. A free-text description of detected features appears in an editable textarea with a
Save button. If any photo fails analysis, an error state with a Retry button appears for that photo.

Verification: `scorePhoto(signedUrl, 'car')` called from a test script returns a valid
`QualityScoreSnapshot`; a new row exists in `quality_scores`; the object's `category` and
`features_text` columns are populated.

### Key Discoveries

- `photos.original_url TEXT NOT NULL` — S-01 will store the photo URL here; the `analyzeObject`
  implementation must generate a fresh Supabase Storage signed URL for each photo before passing
  to `scorePhoto()` (bucket `original-photos` is private) — `supabase/migrations/...initial_schema.sql:120`
- `quality_scores` uses `NUMERIC(4,2)` — scores must be in range 0.00–10.00; overall_score
  is the arithmetic mean of the 8 dimensions — `...initial_schema.sql:142–150`
- `aiConfig.maxRetries = 2` already defined in `src/lib/config.ts:41` — reuse for scoring retries
- S-03 requires `scorePhoto(signedUrl, category)` exported from `src/lib/quality-scoring.ts` as
  a module function, not only as an HTTP route — `context/changes/ai-transformation-session/plan.md:55`
- S-03 also requires `GET /api/quality-scores/photo/[photoId]` to fetch pre-computed scores —
  `context/changes/ai-transformation-session/plan.md:216`

## What We're NOT Doing

- Building the photo gallery or object creation UI — that is S-01
- Building the transformation flow — that is S-03
- Building the global style library — that is S-04
- Adding per-category scoring weights now — stubs added to `scoringConfig` for future calibration;
  MVP ships with equal weights
- Async polling for analysis (unlike S-03's 60 s transformation, GPT-4o Vision calls complete
  in ~10–30 s; synchronous response is sufficient)
- GDPR consent flow for AI calls (faza 2)

## Implementation Approach

Four sequential phases:

1. **Config, Types & DB Migration** — minimal surface area; unblocks Phases 2–4
2. **Scoring Core Module** — `scorePhoto()` + `analyzeObject()` + unit tests; can be developed
   and tested independently of S-01
3. **API Routes** — three routes wiring the scoring module to the DB and HTTP boundary; blocked
   on S-01 for end-to-end manual testing (photo records must exist)
4. **Analysis UI Component** — React island added to S-01's object detail page; blocked on S-01
   for integration and full manual testing

## Critical Implementation Details

**`original_url` requires a fresh signed URL before each GPT-4o call.** The `original-photos`
bucket is private. `photos.original_url` holds a Supabase Storage path (or a URL that may expire).
Phase 3's API route must call `supabase.storage.from('original-photos').createSignedUrl(path, 60)`
to get a fresh signed URL before invoking `scorePhoto()`. If `original_url` is already a full URL,
use it directly — S-01's contract will clarify this; note it as an assumption to verify when S-01
is planned.

**`overall` (TypeScript) / `overall_score` (DB column) is the arithmetic mean of the 8 dimension
scores.** Round to 2 decimal places to match `NUMERIC(4,2)`. When mapping the GPT-4o response to
`QualityScoreSnapshot`, the field must be named `overall` (matching the TypeScript type); the DB
INSERT uses the column name `overall_score`. `is_sales_ready = overall >= scoringConfig.salesReadinessThreshold`.

**GPT-4o structured output must be enforced via `response_format: { type: "json_schema" }`.** Plain
JSON mode produces inconsistent score ranges; the schema-constrained mode anchors GPT-4o to the
0–10 numeric rubric. Include explicit rubric anchors in the system prompt (0 = unusable, 5 = average
consumer photo, 10 = professional studio) to calibrate scores across calls.

---

## Phase 1: Config, Types & DB Migration

### Overview

Adds the `visionModel` config key S-02 needs, extends `scoringConfig` with per-category weight
stubs, defines TypeScript types and Zod schemas for scoring requests and responses, and adds the
`features_text` column to the `objects` table via a new migration.

### Changes Required

#### 1. Add vision model config and weight stubs

**File**: `src/lib/config.ts`

**Intent**: Add `visionModel` so the scoring module can reference the GPT-4o model name from config
(not hardcoded). Add `categoryWeights` as a stub map for future per-category calibration.

**Contract**:
```typescript
// Inside aiConfig:
visionModel: "openai/gpt-4o",

// Inside scoringConfig — add after 'categories':
/**
 * Per-category dimension weights for overall (QualityScoreSnapshot) / overall_score (DB) calculation.
 * All dimensions currently equal weight (1/8 = 0.125).
 * Calibrate per category before public launch.
 */
categoryWeights: {
  car:           { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
  'real-estate': { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
  item:          { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
} satisfies Record<ObjectCategory, Record<string, number>>,
```

#### 2. TypeScript types and Zod schemas for analysis

**File**: `src/types/analysis.ts` (new file)

**Intent**: Define the request/response types for the scoring API route and the GPT-4o response
shape so both the module and route share one type system.

**Contract**: Export `AnalyzeRequestSchema` (Zod), `GptScoringResponse` (GPT-4o output shape),
and `ObjectAnalysisResult` (what `analyzeObject()` returns). `QualityScoreSnapshot` is already
defined in `src/types/transformations.ts` — import and re-export rather than redefine.

```typescript
// GptScoringResponse — the JSON_SCHEMA GPT-4o must return
export interface GptScoringResponse {
  category: 'car' | 'real-estate' | 'item';
  features_text: string;       // free-text detected features
  scores: {
    sharpness:       number;   // 0–10
    lighting:        number;
    background:      number;
    object_features: number;
    damage_defects:  number;
    labels:          number;
    angle_coverage:  number;
    sales_readiness: number;
  };
}

export type PhotoScoreResult =
  | { photo_id: string; snapshot: QualityScoreSnapshot; score_id: string }
  | { photo_id: string; error: string };

export interface ObjectAnalysisResult {
  category: ObjectCategory;
  features_text: string;
  photoScores: PhotoScoreResult[];
}
```

#### 3. DB migration: add features_text to objects

**File**: `supabase/migrations/20260531000001_add_objects_features_text.sql` (new file)

**Intent**: Add the `features_text` column to the `objects` table so S-02 can store AI-detected
free-text features that the user can confirm or edit.

**Contract**:
```sql
ALTER TABLE objects ADD COLUMN features_text TEXT;
```

#### 4. Regenerate TypeScript database types

**File**: `src/types/database.generated.ts`

**Intent**: Update the auto-generated types to include the new `features_text` column on `objects`.

**Contract**: Run `npx supabase gen types typescript --local > src/types/database.generated.ts`
after the migration applies.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Migration applies cleanly: `supabase db reset` (no errors)

#### Manual Verification

- `SELECT features_text FROM objects LIMIT 1` returns column (NULL for existing rows)
- `src/types/database.generated.ts` contains `features_text?: string | null` on `objects` Row type

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Scoring Core Module

### Overview

Implements the GPT-4o Vision integration and the two exported functions S-02 and S-03 depend on:
`scorePhoto()` (per-photo scoring) and `analyzeObject()` (batch analysis for an object). Unit
tests mock the OpenRouter fetch call and verify score computation and DB write contracts.

### Changes Required

#### 1. Quality scoring module

**File**: `src/lib/quality-scoring.ts` (new file)

**Intent**: Implement `scorePhoto()` and `analyzeObject()`. This is the core AI integration:
build the system prompt with category-aware rubric, call `openai/gpt-4o` via OpenRouter with
structured JSON output, compute `overall` as the weighted mean, and return `QualityScoreSnapshot`.
`scorePhoto` is a pure function — no DB write. `analyzeObject` owns all DB persistence.

**Contract**:
```typescript
// Module exports — these are the contracts S-03 and Phase 3 depend on:

export async function scorePhoto(
  signedUrl: string,
  category: ObjectCategory,
): Promise<QualityScoreSnapshot>;
// Pure function: calls openai/gpt-4o via OpenRouter with JSON schema output.
// No DB write — callers are responsible for persisting the returned snapshot.
// S-03 uses the return value directly for transformations.score_after.
// Retries up to aiConfig.maxRetries on fetch error or JSON parse failure.
// Throws on final failure (caller surfaces the error).

export async function analyzeObject(
  objectId: string,
  photoIds: string[],
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ObjectAnalysisResult>;
// Fetches photo records from DB to get original_url values.
// Generates signed URLs for each photo (original-photos bucket).
// Uses Promise.allSettled to call scorePhoto() for each photo in parallel.
// For fulfilled results: INSERTs one quality_scores row per photo.
// For rejected results: records the error string in PhotoScoreResult.
// If objects.category is NULL, uses the category from the first fulfilled result.
// Updates objects.features_text from the first fulfilled result.
// Returns ObjectAnalysisResult — always resolves even if some photos failed.
```

The system prompt must include explicit numeric rubric anchors for each of the 8 dimensions and
a guardrail note that scores reflect the photo's presentation quality, not the product's value.
Category detection is embedded: if the caller doesn't know the category, GPT-4o infers it from
the photo. The JSON schema enforces output structure.

#### 2. Unit tests

**File**: `src/lib/quality-scoring.test.ts` (new file)

**Intent**: Verify `overall_score` computation, `is_sales_ready` threshold logic, and retry
behavior — all without real OpenRouter calls.

**Contract**: Tests mock `fetch` (or the OpenRouter client). No DB mock needed — `scorePhoto`
is a pure function. Cover:
- Correct `overall` (mean of 8 equal weights, rounded to 2 dp)
- `is_sales_ready = true` when `overall >= 7`, `false` when `< 7`
- Retry fires on `fetch` rejection; throws after `maxRetries` exhausted
- Malformed JSON from GPT causes retry (not a silent pass)

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm test` (or `npx vitest run`)
- Type checking passes: `npm run typecheck`

#### Manual Verification

- Call `scorePhoto()` with a real photo URL and category via a one-off test script; inspect the
  returned `QualityScoreSnapshot` for plausible 0–10 scores and correct `is_sales_ready` flag
- Call `analyzeObject()` with real photo IDs; verify a new row exists in `quality_scores` and
  `objects.category` / `objects.features_text` are populated

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation of a live `scorePhoto()` call before proceeding to Phase 3.

---

## Phase 3: API Routes

### Overview

Three routes that wire the scoring module to the HTTP boundary. Phases 3 can be coded and
type-checked before S-01 is done, but end-to-end manual testing requires S-01 (photo records
must exist in the DB, object detail page must be accessible).

### Changes Required

#### 1. Analyze endpoint

**File**: `src/pages/api/objects/[objectId]/analyze.ts` (new file)

**Intent**: Accept a list of photo IDs, call `analyzeObject()`, and return the scores and updated
object metadata. This is the endpoint the Phase 4 React island POSTs to when the user clicks
"Analyze selected".

**Contract**:
- Method: POST; requires authenticated session (401 if absent)
- Request body (Zod): `{ photo_ids: string[] }` — at minimum 1 photo ID
- Validates: user owns `objectId`; each `photo_id` belongs to that object
- Calls `analyzeObject(objectId, photo_ids, supabase, userId)`
- Returns `200 { category, features_text, scores: PhotoScoreResult[] }` — always 200 if the
  request is valid; per-photo failures appear as `{ photo_id, error }` entries in the array
- Returns `400` on validation error, `500` only if ALL photos failed (no usable results)

#### 2. Score fetch endpoint (S-03 contract)

**File**: `src/pages/api/quality-scores/photo/[photoId].ts` (new file)

**Intent**: Return the latest pre-computed `quality_scores` row for a photo so S-03's POST
`/api/transformations/start` can fetch `score_before` without re-scoring.

**Contract**:
- Method: GET; requires authenticated session (401 if absent)
- Validates: user owns the photo referenced by `photoId`
- Queries `quality_scores WHERE photo_id = $photoId ORDER BY scored_at DESC LIMIT 1`
- Returns `200 { score: QualityScoreSnapshot }` or `404` if no score exists yet

#### 3. Category override endpoint

**File**: `src/pages/api/objects/[objectId]/category.ts` (new file)

**Intent**: Allow the user to correct the AI-proposed category and save updated features text.
Called by the inline category dropdown and features textarea save button in the Phase 4 UI.

**Contract**:
- Method: PATCH; requires authenticated session (401 if absent)
- Request body (Zod): `{ category: 'car' | 'real-estate' | 'item'; features_text?: string }`
- Validates: user owns `objectId`
- Updates `objects.category` (and `objects.features_text` if provided)
- Returns `200 { category, features_text }`

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`

#### Manual Verification

- POST `/api/objects/[objectId]/analyze` with valid photo IDs returns expected score shape
- GET `/api/quality-scores/photo/[photoId]` returns the stored score for a scored photo; returns
  404 for an unscored photo
- PATCH `/api/objects/[objectId]/category` with `{ category: 'item' }` updates the DB row

**Implementation Note**: Full manual testing requires S-01 to be implemented (objects and photos
must exist). Automated type-checking can proceed independently. Pause here after manual tests
pass before starting Phase 4.

---

## Phase 4: Analysis UI Component

### Overview

A React island component added to S-01's object detail page. Renders photo checkboxes, the
Analyze button, score grid, category dropdown, features textarea, and error states. The component
is self-contained and accepts props — S-01 renders it in the appropriate section of the object
detail page.

### Changes Required

#### 1. AnalysisSection React island

**File**: `src/components/AnalysisSection.tsx` (new file)

**Intent**: All analysis UI in one island: photo selection → analyze trigger → score display →
category confirm → features edit. Must handle loading, success, per-photo error, and retry states.

**Contract**:
```typescript
interface AnalysisSectionProps {
  objectId: string;
  photos: Array<{ id: string; thumbnail_url: string | null; original_url: string }>;
  initialCategory?: ObjectCategory | null;
  initialFeaturesText?: string | null;
  initialScores?: Record<string, QualityScoreSnapshot>; // keyed by photo_id
}
export default function AnalysisSection(props: AnalysisSectionProps): JSX.Element;
```

State machine per analyzed photo: `idle` → `loading` → `success` | `error`. On `error`, show
"Analysis failed — Retry" button that re-POSTs only the failed photo's ID. Category dropdown
calls PATCH on change (optimistic update, revert on error). Features textarea save calls PATCH.
No global re-analyze: the Analyze button only processes photos that are checked and not yet scored
(previously scored photos show their cached result and a "Re-analyze" option if the user wants
fresh scores).

#### 2. Integration note for S-01

**File**: `src/pages/objects/[objectId].astro` (S-01 creates this file)

**Intent**: S-01's object detail page must render `<AnalysisSection>` as an Astro client island.

**Contract**: S-01 passes `objectId`, `photos` array, initial `category`/`featuresText`, and
`initialScores` from server-fetched data. To populate `initialScores`, S-01's page must run:

```sql
SELECT DISTINCT ON (photo_id) photo_id, sharpness, lighting, background, object_features,
  damage_defects, labels, angle_coverage, sales_readiness, overall_score AS overall, is_sales_ready
FROM quality_scores
WHERE photo_id = ANY($photoIds)
ORDER BY photo_id, scored_at DESC
```

Convert the result to `Record<string, QualityScoreSnapshot>` before passing to the island.
Exact placement: below the photo gallery, above any transformation call-to-action (S-03).
The island needs `client:load` directive.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`

#### Manual Verification

- Select 2 photos and click "Analyze selected" → spinner appears → after GPT-4o response, score
  grid shows 8 dimension rows per photo with correct scores and color-coded sales readiness badge
- Select a photo that was already scored → shows cached scores without calling the API again
- Deselect all photos → "Analyze selected" button is disabled
- Analysis fails (network error or AI error) → "Analysis failed — Retry" appears for that photo;
  other photos' results unaffected
- Category dropdown changes → PATCH fires → refreshed category visible without page reload
- Features textarea edited and saved → PATCH fires → text persists after page reload
- Mobile viewport (375 px): score grid scrolls horizontally; checkboxes and buttons remain tappable

**Implementation Note**: Integration testing requires S-01's object detail page to be built.
Build `AnalysisSection` independently and smoke-test it with a stub page (or Storybook) before
S-01 integration. Pause for manual confirmation of the full end-to-end flow after integration.

---

## Testing Strategy

### Unit Tests

- `scorePhoto()` computes `overall_score` correctly (arithmetic mean, 2 dp rounding)
- `is_sales_ready` toggles at threshold boundary (6.99 → false, 7.00 → true)
- Retry fires on fetch rejection; throws `Error` after `maxRetries` exhausted
- Malformed GPT-4o JSON triggers retry (not silent success with zeroed scores)

### Integration Tests

- POST `/api/objects/[objectId]/analyze` with 2 real photo IDs → two `quality_scores` rows in DB;
  object `category` and `features_text` updated; response matches `QualityScoreSnapshot` schema
- GET `/api/quality-scores/photo/[photoId]` → returns stored snapshot

### Manual Testing Steps

1. Upload 3 photos to an object (S-01 must be done), select 2, click "Analyze" — verify scores appear
2. Check `quality_scores` table: confirm 2 new rows, `photo_id` matches, scores in 0–10 range
3. Confirm `objects.category` is populated; `objects.features_text` has a plausible description
4. Change category via dropdown — confirm DB update via direct query
5. Trigger analysis on an already-scored photo — confirm UI shows cached score (no new DB row)
6. Simulate API failure (disconnect network) — confirm per-photo error + Retry button
7. Call `scorePhoto()` directly from a REPL with a known-quality photo (e.g., professional car
   photo) — verify `sales_readiness` score ≥ 7 for a clean studio shot

## Performance Considerations

GPT-4o Vision calls take approximately 10–30 s per photo. With up to 10 photos analyzed in
parallel (Phase 3's API route uses `Promise.all`), wall-clock response time is bounded by the
slowest single call (~30 s). This is acceptable for a synchronous response with a loading
indicator; no polling or background jobs are needed. If Cloudflare's edge enforces a response
timeout shorter than 30 s, revisit and switch to `ctx.waitUntil` + polling in Phase 3 (it would
mirror S-03's pattern).

## S-01 Prerequisite Contracts

S-02's Phase 3 and Phase 4 depend on the following shapes from S-01 (to be confirmed when S-01
is planned):

```typescript
// GET /api/objects/[objectId]  — object detail (S-01 provides)
{
  id: string;
  name: string;
  version: string;
  category: 'car' | 'real-estate' | 'item' | null;
  features_text: string | null;
  photos: Array<{
    id: string;
    original_url: string;    // Supabase Storage path or signed URL
    thumbnail_url: string | null;
    file_size_bytes: number;
  }>;
}
```

If `original_url` stores a raw Storage path rather than a URL, Phase 3's `analyzeObject()` must
call `supabase.storage.from('original-photos').createSignedUrl(path, 60)` before passing to
`scorePhoto()`. If S-01 stores a full signed URL, use it directly. Resolve this when S-01 is
planned.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02, prerequisites F-01 / S-01)
- PRD: `context/foundation/prd.md` (FR-004, FR-007, FR-008, FR-009; quality score dimensions)
- DB schema: `supabase/migrations/20260530000000_initial_schema.sql` (objects, photos, quality_scores)
- Config constants: `src/lib/config.ts` (`aiConfig.visionModel`, `scoringConfig`)
- Score snapshot type: `src/types/transformations.ts` (QualityScoreSnapshot)
- S-03 scoring contract: `context/changes/ai-transformation-session/plan.md` (scorePhoto signature,
  GET /api/quality-scores/photo/[photoId] contract)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Config, Types & DB Migration

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Migration applies cleanly: `supabase db reset`

#### Manual

- [x] 1.3 `SELECT features_text FROM objects LIMIT 1` returns column (NULL default)
- [x] 1.4 `src/types/database.generated.ts` contains `features_text` on objects Row type

### Phase 2: Scoring Core Module

#### Automated

- [ ] 2.1 Unit tests pass: `npm test` (or `npx vitest run`)
- [ ] 2.2 Type checking passes: `npm run typecheck`

#### Manual

- [ ] 2.3 `scorePhoto()` called with real photo URL returns valid `QualityScoreSnapshot` (scores 0–10, correct `is_sales_ready`)
- [ ] 2.4 `analyzeObject()` with real photo IDs: new `quality_scores` row exists, `objects.category` and `objects.features_text` populated

### Phase 3: API Routes

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`

#### Manual

- [ ] 3.2 POST `/api/objects/[objectId]/analyze` returns expected score shape
- [ ] 3.3 GET `/api/quality-scores/photo/[photoId]` returns stored score; 404 for unscored photo
- [ ] 3.4 PATCH `/api/objects/[objectId]/category` updates DB row

### Phase 4: Analysis UI Component

#### Automated

- [ ] 4.1 Type checking passes: `npm run typecheck`

#### Manual

- [ ] 4.2 Select 2 photos → Analyze → score grid shows 8 dimensions + sales readiness badge
- [ ] 4.3 Already-scored photo shows cached result without new API call
- [ ] 4.4 No photos selected → Analyze button disabled
- [ ] 4.5 AI failure → per-photo error state + Retry button; other photos unaffected
- [ ] 4.6 Category dropdown change → DB updated, visible without reload
- [ ] 4.7 Features textarea save → persists after reload
- [ ] 4.8 Mobile 375 px: score grid scrollable, controls tappable
