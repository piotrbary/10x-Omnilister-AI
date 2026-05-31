# AI Transformation Session Implementation Plan

## Overview

Implements S-03 — the north-star slice of Omnilister AI. After uploading photos and getting quality scores (S-01 + S-02), the user selects photos, picks a preset style or types a custom prompt, and triggers transformation via OpenRouter (`openai/gpt-image-1`). The UI polls for progress, showing a draft preview first (~5s) and the full result later (~60s). A side-by-side before/after view with score delta lets the user give inline feedback (improved / not improved) and choose which transformed photos to save to the object's library.

## Current State Analysis

As of 2026-05-30 the codebase has:
- Auth flow complete (email/password, Supabase SSR, middleware)
- `src/lib/config.ts` with `aiConfig` (`provider: "openrouter"`, `baseUrl`, `transformationModel: "openai/gpt-image-1"`, `transformationTimeoutMs: 60000`, `draftPreviewTimeoutMs: 5000`, `maxRetries: 2`) and `storageConfig` (100 MB per account, 10 MB per photo)
- `src/lib/supabase.ts` factory pattern (takes headers + cookies, returns SupabaseClient)
- CVA button + FormField + error components reusable
- Cloudflare Workers target (`wrangler.jsonc`), `ctx.waitUntil()` available for background AI calls
- **No product DB schema**, no Storage integration, no AI calls, no product pages

Prerequisites F-01, S-01, S-02 are `proposed` — not yet planned. This plan defines the contracts S-03 needs from each; implementation cannot begin until all three are done.

## Desired End State

A logged-in user can open an object, select one or more photos, choose a transformation style, trigger the transformation, and see draft previews within ~5 seconds with full results within ~60 seconds. Each result is shown side-by-side with the original, with a summary score and expandable dimension breakdown. The user rates each result (improved / not improved), picks which to save, and the saved transformed photos appear in the object's photo library alongside the originals.

### Key Discoveries

- `ctx.waitUntil()` on Cloudflare Workers allows the POST `/start` to return job IDs immediately while OpenAI calls run in background. This is the only safe async pattern — no Durable Objects, no queues needed. (`wrangler.jsonc`, `src/pages/api/auth/` pattern)
- `aiConfig.transformationTimeoutMs` = 60000 and `aiConfig.draftPreviewTimeoutMs` = 5000 are already in `src/lib/config.ts` — use them as constants rather than hardcoding.
- `aiConfig.maxRetries` = 2 already defined. Retry logic on transformation failure must respect this.
- Storage limit check (`storageConfig.Max_Client_Repository` = 100 MB) must happen before saving a transformed image. F-01 must implement storage usage tracking; this plan calls into it.

## What We're NOT Doing

- Not building the global style library (S-04) — presets are hardcoded per category in S-03
- Not implementing the scoring algorithm (S-02) — S-03 calls S-02's exported scoring function
- Not building the photo gallery or object creation UI (S-01)
- Not building the DB schema or Storage buckets (F-01)
- Not implementing GDPR consent flow (faza 2 / FR-P2-001 – FR-P2-007)
- Not handling concurrent transformations from multiple browser tabs (out of MVP scope)
- Not sending email notifications when transformation completes

## Implementation Approach

Three sequential phases:
1. **Data Contracts & Schema** — TypeScript types + Zod schemas for transformation data; preset styles config; documented schema spec for F-01; documented interface contracts for S-01/S-02.
2. **Backend — Transformation API** — four API routes (start, status poll, save, feedback) + OpenAI `gpt-image-1` client; `waitUntil()` background processing; job status lifecycle in DB.
3. **Frontend — Session UI** — Astro page + React island (photo selector → style picker → job cards with polling → save confirmation).

Async pattern: POST `/start` creates DB records and fires `ctx.waitUntil(processJobs())`, returning job IDs immediately. Client polls GET `/status?ids=…` every 2s. Background processor calls OpenAI twice per photo (draft size → full size), writes intermediate status to DB (`draft_ready` then `full_ready`), then re-scores the result using S-02's function to get `score_after`.

## Critical Implementation Details

**`ctx.waitUntil()` is the only background-job mechanism.** There is no queue, no cron, no Durable Object. The POST `/start` handler must call `context.locals.runtime.ctx.waitUntil(processJobs(jobs, supabase))` before returning its response. If `waitUntil` is not called, the Worker terminates and OpenRouter calls never complete.

**Draft via smaller model call, not a separate endpoint.** For the 5-second draft, call `openai/gpt-image-1` via OpenRouter with the smallest supported size (check at implementation time; if no sub-1024 option is available, fall back to `openai/dall-e-2` with `size: '256x256'` for the draft). Both calls happen inside the single `waitUntil` background task — draft updates `status='draft_ready'` and `draft_url`, then full result updates `status='full_ready'` and `result_url`.

**Re-scoring requires S-02's `scorePhoto` function, not an HTTP call.** After the full result lands in Storage, call S-02's exported `scorePhoto(signedUrl, category)` inline (same Worker process). An HTTP round-trip would add latency inside an already-60s background task. S-02 must export this as a module function, not only as an API route.

---

## Phase 1: Data Contracts & Schema

### Overview

Creates the TypeScript types, Zod schemas, and preset styles that all three subsequent phases depend on. Also documents the exact schema S-03 requires from F-01 and the API/function shapes it requires from S-01/S-02 — so those plans can be written against a stable contract.

### Changes Required

#### 1. Transformation types and Zod schemas

**File**: `src/types/transformations.ts`

**Intent**: Define all TypeScript interfaces and Zod schemas for transformation data so the API routes and UI components share one type system. Serves as the single source of truth for the shape of transformation jobs.

**Contract**:
```typescript
export type TransformationStatus =
  | 'pending'
  | 'draft_ready'
  | 'full_ready'
  | 'failed'
  | 'saved';

export type FeedbackValue = 'improved' | 'not_improved';

export interface QualityScoreSnapshot {
  sharpness: number;
  lighting: number;
  background: number;
  object_features: number;
  damage_defects: number;
  labels: number;
  angle_coverage: number;
  sales_readiness: number;
  overall: number;
  is_sales_ready: boolean;
}

export interface TransformationJob {
  id: string;
  user_id: string;
  object_id: string;
  photo_id: string;
  style_name: string;         // preset key or 'custom'
  prompt: string;             // final prompt sent to OpenRouter
  status: TransformationStatus;
  draft_url: string | null;
  result_url: string | null;
  result_file_size_bytes: number | null; // set by processor at step 3; used by trigger + /save limit check
  score_before: QualityScoreSnapshot | null;
  score_after: QualityScoreSnapshot | null;
  feedback: FeedbackValue | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}
```

Add Zod schemas for `StartTransformationRequest` (body of POST `/start`) and `StatusResponse` (GET `/status` array element).

#### 1b. Unit tests for buildPrompt

**File**: `src/lib/transformation-styles.test.ts`

**Intent**: Verify the no-distortion guardrail is always appended and that custom overrides concatenate correctly. Satisfies progress item 1.2.

**Contract**: Two test cases — `buildPrompt('showroom', undefined)` contains the guardrail string; `buildPrompt('showroom', 'extra instruction')` contains both the base prompt and the override.

#### 2. Preset transformation styles

**File**: `src/lib/transformation-styles.ts`

**Intent**: Defines the hardcoded preset styles available per object category. Presets feed the style picker UI and generate the base prompt for the OpenAI call. Always appends a no-distortion guardrail to every final prompt.

**Contract**: Export a `PRESET_STYLES` record keyed by `Category` ('car' | 'real-estate' | 'item'), each category having an array of `{ key: string; label: string; description: string; basePrompt: string }` objects. Export a `buildPrompt(styleKey: string, customOverride?: string): string` function that:
1. Looks up the base prompt by key
2. Appends `customOverride` if provided
3. Always appends: `"IMPORTANT: Do NOT add, remove, or alter any actual features, markings, or characteristics of the product. Only improve the photographic presentation."`

Presets to include:

**car**: `showroom` ("Professional dealership showroom, neutral floor, even studio lighting"), `outdoor-clean` ("Clean outdoor setting, neutral empty background, natural daylight"), `white-studio` ("Pure white seamless background, professional studio lighting")

**real-estate**: `bright-interior` ("Maximize natural light and brightness; clear bright sky visible through windows; clean uncluttered appearance"), `twilight-exterior` ("Warm golden-hour lighting, well-lit façade, clear sky"), `clean-professional` ("Balanced professional real estate photography exposure, crisp architectural details")

**item**: `white-background` ("Pure white seamless background, even multi-angle studio lighting, no props"), `neutral-background` ("Soft neutral gray background, professional product photography, no harsh shadows"), `lifestyle-context` ("Natural lifestyle photography context, item as focal point")

#### 3. `transformations` table — schema specification for F-01

**File**: *No new file — this contract is documented here and F-01's plan will consume it.*

**Intent**: F-01 must include a `transformations` table in its migration. Define the exact schema so F-01's plan can be written with the correct columns and RLS.

**Contract** (SQL fragment F-01 must include):

```sql
CREATE TABLE transformations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id       UUID NOT NULL REFERENCES objects(id)    ON DELETE CASCADE,
  photo_id        UUID NOT NULL REFERENCES photos(id)     ON DELETE CASCADE,
  style_name      TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending',   -- see TransformationStatus enum
  draft_url              TEXT,
  result_url             TEXT,
  result_file_size_bytes BIGINT,      -- added by F-01; set by processor at step 3; required by storage trigger + /save limit check
  score_before           JSONB,
  score_after     JSONB,
  feedback        TEXT,        -- 'improved' | 'not_improved' | NULL
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: owner-only access
ALTER TABLE transformations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner access" ON transformations
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Storage path convention (F-01 must configure `transformed-photos` bucket to allow this structure):
`{user_id}/{object_id}/{transformation_id}/draft.{ext}` and `.../full.{ext}`

#### 4. Prerequisite interface contracts

**File**: *No new file — documented here as a planning contract.*

**Intent**: Pin the exact API response shapes and module exports S-03 expects from S-01 and S-02 before those plans are written. If S-01 or S-02 diverge, update this section.

**S-01 contracts** (routes S-03 calls):

```typescript
// GET /api/objects/[objectId]
interface ObjectResponse {
  id: string; name: string; version: string;
  category: 'car' | 'real-estate' | 'item' | null;
  user_id: string; created_at: string;
}

// GET /api/objects/[objectId]/photos
interface PhotosResponse {
  photos: Array<{
    id: string; object_id: string;
    original_url: string;   // signed Supabase Storage URL
    thumbnail_url: string;
    created_at: string;
  }>;
}
```

**S-02 contracts** (route + module function S-03 calls):

```typescript
// GET /api/quality-scores/photo/[photoId]  — fetch pre-computed score
interface QualityScoreResponse extends QualityScoreSnapshot {
  photo_id: string; scored_at: string;
}

// src/lib/quality-scoring.ts  — module export used inline in waitUntil background task
export async function scorePhoto(
  signedUrl: string,
  category: 'car' | 'real-estate' | 'item'
): Promise<QualityScoreSnapshot>;
```

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with new `src/types/transformations.ts` and `src/lib/transformation-styles.ts` in place
- `buildPrompt('showroom', undefined)` includes the no-distortion guardrail string
- `buildPrompt('showroom', 'extra instruction')` includes both base prompt and override

#### Manual Verification

- Review the `transformations` table schema against F-01's requirements — confirm all FK references match `objects`, `photos`, `auth.users`
- Confirm `PRESET_STYLES` has exactly 3 presets per category and all `basePrompt` strings avoid adding non-existent product features

**Implementation Note**: After completing this phase, verify types compile and preset output looks correct. Confirm the schema spec has been communicated to the F-01 change before proceeding to Phase 2.

---

## Phase 2: Backend — Transformation API

### Overview

Four API routes that manage the lifecycle of transformation jobs. The POST `/start` route creates DB records and fires `waitUntil()` background processing. GET `/status` is the polling target. POST `/save` and POST `/feedback` handle the end-of-session actions.

### Changes Required

#### 1. OpenRouter image editing utility

**File**: `src/lib/openrouter-images.ts`

**Intent**: Wraps the OpenRouter image-editing API for transformation. Routes to `openai/gpt-image-1` via OpenRouter's OpenAI-compatible endpoint. Abstracts two call modes — draft (fastest available size) and full (1024×1024) — and handles retries up to `aiConfig.maxRetries`.

**Contract**: Export two functions:
- `generateDraft(imageBuffer: Buffer, prompt: string, mimeType: string): Promise<{ url: string; buffer: Buffer }>`
- `generateFull(imageBuffer: Buffer, prompt: string, mimeType: string): Promise<{ url: string; buffer: Buffer }>`

Both call OpenRouter at `aiConfig.baseUrl` using the OpenAI SDK with `baseURL` overridden to `aiConfig.baseUrl`. Use `model: aiConfig.transformationModel` (`"openai/gpt-image-1"`). `generateDraft` uses the smallest size the model supports via OpenRouter (check at implementation time; fall back to `openai/dall-e-2` with `size: '256x256'` if no sub-1024 option). Return the generated image as a Buffer for upload to Supabase Storage.

Use `OPENROUTER_API_KEY` from Workers Secrets (available via `import.meta.env.OPENROUTER_API_KEY` in Astro/Cloudflare Workers). Do not hardcode keys or log image buffers.

#### 2. Background job processor

**File**: `src/lib/transformation-processor.ts`

**Intent**: The async function passed to `ctx.waitUntil()`. Processes all jobs in a batch: for each job, generates draft → updates DB → generates full → updates DB → re-scores → updates DB. Handles per-job failures without stopping the batch; marks individual jobs as `failed` and records the error.

**Contract**: Export `processTransformationBatch(jobs: TransformationJob[], supabase: SupabaseClient): Promise<void>`.

Processing order for each job:
1. Fetch original photo from `original_url` (signed URL from DB) → download as Buffer
2. Call `generateDraft()` → upload to `transformed-photos/{user_id}/{object_id}/{job.id}/draft.jpg` → update `status='draft_ready'`, `draft_url=<signed url>`
3. Call `generateFull()` → upload to `transformed-photos/{user_id}/{object_id}/{job.id}/full.jpg` → update `status='full_ready'`, `result_url=<signed url>`, `result_file_size_bytes=<buffer.byteLength>` (required by F-01's storage trigger and POST `/save` limit check)
4. Call S-02's `scorePhoto(result_url, category)` → update `score_after`
5. On any error: if `retry_count < aiConfig.maxRetries`, increment `retry_count` and retry from the failed step (if `draft_url` is already set, skip step 2 and retry from step 3). Otherwise set `status='failed'`, `error_message=<error.message>`.

Steps 1–4 for all jobs run in parallel via `Promise.all()`.

#### 3. POST /api/transformations/start

**File**: `src/pages/api/transformations/start.ts`

**Intent**: Creates `transformations` DB rows for the selected photos, fires the background processor via `waitUntil()`, and returns job IDs immediately. Validates that the requesting user owns the object and each photo.

**Contract**:
- Method: POST; requires authenticated session (read `context.locals.user`; return 401 if absent)
- Request body (Zod): `{ object_id: string; photo_ids: string[]; style_name: string; custom_prompt?: string }`
- Validates: user owns `object_id`; each `photo_id` belongs to that object; photo count ≤ 10
- Fetches `score_before` for each photo from `quality_scores` table (inserts `null` if not yet scored — S-02 may not have run)
- Inserts one `transformations` row per photo with `status='pending'`, `prompt=buildPrompt(style_name, custom_prompt)`, `score_before`
- Fetches object category from `objects` table (needed by `processTransformationBatch`)
- Calls `ctx.waitUntil(processTransformationBatch(jobs, supabase))` — this is the only place `waitUntil` is called
- Returns 200: `{ job_ids: string[] }`

#### 4. GET /api/transformations/status

**File**: `src/pages/api/transformations/status.ts`

**Intent**: Polling target. Returns current status of one or more jobs in a single DB query. Called by the frontend every ~2s.

**Contract**:
- Method: GET; requires authenticated session
- Query param: `ids` (comma-separated job UUIDs; max 20)
- Validates: all `ids` belong to `context.locals.user` (use RLS — a single SELECT query handles this)
- Returns 200: `{ jobs: Array<{ id, status, draft_url, result_url, score_before, score_after, error_message, retry_count }> }`
- Returns jobs in the same order as requested `ids`

#### 5. POST /api/transformations/[jobId]/save

**File**: `src/pages/api/transformations/[jobId]/save.ts`

**Intent**: Marks a completed transformation as saved, confirming the result photo should appear in the object's library. Also updates the user's storage usage counter (F-01 contract).

**Contract**:
- Method: POST; requires authenticated session; validates user owns the job
- Requires job `status` to be `full_ready` (not `pending`, `draft_ready`, or `failed`)
- Reads `profiles.storage_used_bytes` for the current user; adds `job.result_file_size_bytes`; if sum > `storageConfig.Max_Client_Repository` returns 400 with a human-readable limit message
- Updates `status='saved'` — F-01's `on_transformation_storage_change` trigger fires automatically and increments `profiles.storage_used_bytes`; the route must NOT also update the counter (would double-count)
- Returns 200: `{ saved: true }`

#### 6. POST /api/transformations/[jobId]/feedback

**File**: `src/pages/api/transformations/[jobId]/feedback.ts`

**Intent**: Records the user's assessment of whether the transformation improved the photo. Satisfies the PRD's primary success criterion (feedback: improvement / no improvement).

**Contract**:
- Method: POST; requires authenticated session; validates user owns the job
- Body (Zod): `{ feedback: 'improved' | 'not_improved' }`
- Updates `transformations.feedback`; idempotent (re-submitting changes the value)
- Returns 200: `{ ok: true }`

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes across all new API route files and `src/lib/openrouter-images.ts`
- POST `/api/transformations/start` with a missing or invalid body returns 400 with validation errors
- GET `/api/transformations/status` without auth returns 401
- POST `/api/transformations/[jobId]/feedback` with `feedback: 'bad-value'` returns 400

#### Manual Verification

- POST `/start` with a valid object + 2 photos: DB shows 2 `pending` rows; within ~5s both rows transition to `draft_ready` with a non-null `draft_url`; within ~60s both reach `full_ready` with `result_url` and `score_after`
- GET `/status?ids=…` returns correct status for all job IDs in the response
- Downloading `draft_url` returns a smaller/lower-res image; `result_url` returns a full-quality image
- POST `/save` on a `full_ready` job → `status='saved'`; re-checking object's saved photos in S-01's gallery UI shows the new image
- POST `/feedback` with `improved` → DB row reflects the feedback; POST again with `not_improved` → updates correctly
- POST `/start` when user is at 99.9 MB of 100 MB storage limit → 400 error with human-readable limit message

**Implementation Note**: These manual tests require F-01, S-01, and S-02 to be in place. Run automated tests first; flag all manual tests as blocked until prerequisites are done. Confirm with the human before proceeding to Phase 3.

---

## Phase 3: Frontend — Session UI

### Overview

A single Astro page (`/objects/[objectId]/transform`) renders a React island that orchestrates the entire session: photo selection → style picker → async transformation with polling → before/after results with feedback → save confirmation.

### Changes Required

#### 1. Transformation session page

**File**: `src/pages/objects/[objectId]/transform.astro`

**Intent**: Protected Astro page that fetches the object + its photos + their pre-computed quality scores, then passes everything as props to the `TransformationSession` React island.

**Contract**: SSR page; reads `objectId` from route params. Makes three parallel fetches: GET `/api/objects/[objectId]`, GET `/api/objects/[objectId]/photos`, and GET `/api/quality-scores/photo/[id]` for each photo. Also fetches any non-terminal transformations for this object: `SELECT * FROM transformations WHERE object_id = $id AND status NOT IN ('failed','saved') AND created_at > NOW() - INTERVAL '24 hours'` — these are in-progress jobs from a potential prior session. Passes `{ object, photos, scoresByPhotoId, initialJobs }` to the island. Redirects to `/auth/signin` if unauthenticated (middleware handles this). Returns 404 if `objectId` is not owned by the current user.

#### 2. Photo selector

**File**: `src/components/transformation/PhotoSelector.tsx`

**Intent**: Displays the object's photos as a multi-select grid. User checks 1–N photos to include in the transformation batch.

**Contract**: Props: `{ photos: PhotosResponse['photos']; selectedIds: string[]; onToggle: (id: string) => void }`. Each photo renders as a thumbnail with a checkbox overlay; clicking the thumbnail toggles selection. A counter ("2 of 5 selected") sits above the grid. Minimum 1 photo required before proceeding; show a disabled state on the "Next" button if zero are selected.

#### 3. Style picker

**File**: `src/components/transformation/StylePicker.tsx`

**Intent**: Shows preset style cards (filtered to the object's category) and an optional custom prompt textarea. User selects exactly one style; the prompt textarea pre-fills with that style's `basePrompt` and can be overridden.

**Contract**: Props: `{ category: 'car' | 'real-estate' | 'item'; onSelect: (styleKey: string, customPrompt?: string) => void }`. Renders cards from `PRESET_STYLES[category]`. Selecting a card sets the active style; the textarea below shows the base prompt (editable). If the user clears the textarea completely, restore the base prompt (no empty prompt allowed). A "Transform" CTA button calls `onSelect(activeKey, trimmedOverride || undefined)`.

#### 4. Transformation job card

**File**: `src/components/transformation/TransformationJobCard.tsx`

**Intent**: Represents one photo's transformation job through its full lifecycle: loading spinner → draft preview → full result with before/after comparison, score delta, feedback buttons, and retry on failure.

**Contract**: Props: `{ job: TransformationJob; originalPhoto: { url: string }; scoreBefore: QualityScoreSnapshot | null }`.

State machine per card:
- `pending` / `draft_ready` (no `result_url` yet): show spinner with progress label ("Generating draft…" / "Finalizing…")
- `full_ready` or `saved`: show side-by-side before/after with summary score (`score_before.overall` → `score_after.overall`, formatted as `5.2 → 8.1`). An expandable "Score details" section shows the 8-dimension breakdown. Below the result: thumbs-up / thumbs-down feedback buttons (highlight the active one if `job.feedback` is set). A checkbox "Save this photo" defaults to checked if `score_after.overall > score_before.overall`.
- `failed`: show an error notice with the `error_message` and a "Retry" button (disabled if `retry_count >= aiConfig.maxRetries`).

The "Score details" collapse is implemented with a `<details>` element (no JS needed).

#### 5. TransformationSession orchestrator

**File**: `src/components/transformation/TransformationSession.tsx`

**Intent**: Top-level React island that drives the session state machine through four steps: `selecting` → `styling` → `transforming` → `saving`.

**Contract**: Props: `{ object: ObjectResponse; photos: PhotosResponse['photos']; scoresByPhotoId: Record<string, QualityScoreSnapshot>; initialJobs: TransformationJob[] }`.

On mount: if `initialJobs.length > 0`, skip to the `transforming` step directly and resume polling those job IDs. This implements page-refresh resume from DB state (progress item 3.11).

Step 1 (`selecting`): renders `PhotoSelector`; "Next" advances to `styling`.
Step 2 (`styling`): renders `StylePicker` for `object.category`; "Transform" calls POST `/start` and advances to `transforming`.
Step 3 (`transforming`): renders a list of `TransformationJobCard`s. Starts polling GET `/status?ids=…` every 2s using `setInterval`. Polling stops when all jobs reach a terminal state (`full_ready`, `failed`). Passes `onFeedback` and `onSaveToggle` callbacks into each card. An "All done" CTA advances to `saving` once all jobs are in a terminal state.
Step 4 (`saving`): shows a summary of selected-for-save jobs. "Confirm save" calls POST `/save` for each selected job in parallel; on success redirects to `/objects/[objectId]`.

Polling interval: 2000ms. Start the interval inside a `useEffect`; return `() => clearInterval(id)` as the cleanup function to avoid stale updates after unmount. On tab visibility change (`document.addEventListener('visibilitychange')`), pause polling while hidden; resume on visible.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on all new components
- `npm run build` completes without errors
- No ESLint errors in the transformation components directory

#### Manual Verification

- Navigate to `/objects/[objectId]/transform` — page loads with the object's photos in the selector
- Select 2 photos, pick "Showroom" style, click "Transform" — spinner appears on both cards; within ~5s both cards show a draft image; within ~60s both show the full result with a score delta
- Score delta shows numerically (e.g., "5.2 → 8.1") and the "Score details" expand shows all 8 dimensions for before and after
- Click thumbs-up on one result, thumbs-down on another — both update correctly
- Uncheck "Save this photo" on the lower-scoring result; click "Confirm save" — only the checked photo appears in the object's gallery afterward
- Simulate a failing API call — card shows error notice with "Retry" button; clicking Retry re-triggers the job; after `maxRetries` the button is disabled
- Mobile viewport (375px): side-by-side layout stacks vertically; checkboxes, buttons, and score details remain accessible
- Refresh the page during transformation (`transforming` step) — session resumes from DB state (both cards show correct status without re-triggering new jobs)

**Implementation Note**: Full manual testing of Phase 3 requires Phases 1 and 2 (and their prerequisites F-01/S-01/S-02) to be complete. Test against real OpenRouter API calls — do not mock at this stage. Pause for human confirmation of the before/after UI and score display before calling the phase done.

---

## Testing Strategy

### Automated Tests

- TypeScript `tsc --noEmit` covers all phases' type contracts in CI
- Zod schema parse tests for `StartTransformationRequest` and `StatusResponse` shapes
- `buildPrompt` unit test: verify no-distortion guardrail is always appended; verify custom override is concatenated, not replaced

### Integration Tests

- POST `/start` → GET `/status` cycle with a real Supabase test DB instance (no OpenAI mock — use test images)
- POST `/feedback` idempotency test
- Storage limit enforcement: insert a mock `storage_used_bytes` value at 99.9 MB; confirm POST `/save` returns 400

### Manual Testing Steps

1. End-to-end with 1 photo: select → style → transform → wait for `full_ready` → feedback → save
2. End-to-end with 3 photos in parallel: confirm all three draft previews appear before any full results
3. Simulate network failure mid-poll: confirm UI recovers without showing stale state
4. Test all 9 preset styles across 3 categories: confirm each generates a sensible result image
5. Test custom prompt override: type additional instructions, confirm they appear in the final prompt sent to OpenAI (check DB `prompt` column)
6. Test the storage limit guard: fill account to near-100 MB, attempt to save a transformed image

## Performance Considerations

- `processTransformationBatch` launches all jobs in parallel via `Promise.all()`. For N photos, total time = max(individual job time), not sum.
- The polling endpoint does one `SELECT … WHERE id = ANY($1) AND user_id = auth.uid()` with RLS — a single indexed query regardless of batch size.
- Each `TransformationJobCard` renders independently; no re-render cascade when one job's status updates.

## Migration Notes

No data migration needed (new table). The `transformations` table is defined in the F-01 migration spec above (Phase 1, Change 3). F-01 must include it before S-03 can be deployed.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03, prerequisites F-01 / S-01 / S-02)
- PRD: `context/foundation/prd.md` (FR-010, FR-011, FR-012; NFR timing requirements)
- Tech stack: `context/foundation/tech-stack.md`
- Config constants: `src/lib/config.ts` (`aiConfig`, `storageConfig`, `scoringConfig`)
- Auth pattern to follow: `src/pages/api/auth/signin.ts`
- Supabase client factory: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Contracts & Schema

#### Automated

- [x] 1.1 `npm run typecheck` passes with new types and styles files — 1469164
- [x] 1.2 `buildPrompt` unit test: guardrail always present; override concatenated — 1469164

#### Manual

- [x] 1.3 `transformations` schema spec reviewed against F-01 FK requirements — 1469164
- [x] 1.4 Preset style prompts reviewed — no preset adds non-existent product features — 1469164

### Phase 2: Backend — Transformation API

#### Automated

- [x] 2.1 `npm run typecheck` passes on all new API route files — 6183494
- [x] 2.2 POST `/start` with invalid body returns 400 — 6183494
- [x] 2.3 GET `/status` without auth returns 401 — 6183494
- [x] 2.4 POST `/feedback` with invalid value returns 400 — 6183494

#### Manual

- [x] 2.5 POST `/start` creates pending DB rows; transitions to `draft_ready` within ~5s — 6183494
- [x] 2.6 Jobs reach `full_ready` with non-null `result_url` and `score_after` within ~60s — 6183494
- [x] 2.7 GET `/status` returns correct statuses for all polled IDs — 6183494
- [x] 2.8 POST `/save` marks job saved; photo visible in gallery — 6183494
- [x] 2.9 POST `/feedback` records and updates correctly — 6183494
- [x] 2.10 POST `/save` at 99.9 MB storage returns 400 with limit message — 6183494

### Phase 3: Frontend — Session UI

#### Automated

- [x] 3.1 `npm run typecheck` passes on all new components — e663ac5
- [x] 3.2 `npm run build` completes without errors — e663ac5
- [x] 3.3 No ESLint errors in transformation components directory — e663ac5

#### Manual

- [x] 3.4 Session page loads with correct photos for the object — e663ac5
- [x] 3.5 Draft previews appear within ~5s; full results within ~60s — e663ac5
- [x] 3.6 Score delta displays numerically; dimension breakdown expandable — e663ac5
- [x] 3.7 Feedback thumbs update correctly; save checkbox state persists — e663ac5
- [x] 3.8 Only checked photos saved after confirm; others absent from gallery — e663ac5
- [x] 3.9 Failed job shows error notice with Retry button; disables after `maxRetries` — e663ac5
- [x] 3.10 Mobile layout: stacks vertically, all controls accessible — e663ac5
- [x] 3.11 Page refresh during transformation resumes from DB state — e663ac5
