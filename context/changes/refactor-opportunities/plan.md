# Refactor Opportunities Implementation Plan

## Overview

Three ranked structural refactors from research: (1) replace hardcoded `MOCK_SCORE_BEFORE` with on-demand cheap LLM quality scoring triggered when a photo is selected; (2) fix brittle `slice(-3)` storage path extraction to reconstruct from trusted values per `lessons.md`; (3) add persistent `result_storage_path` to `transformations` so 24h-expired signed URLs can be refreshed on demand.

## Current State Analysis

- **C-3**: `EditorShell.tsx:686` passes `MOCK_SCORE_BEFORE` (hardcoded 5.8) to `ScoreSidebar`. The real scoring pipeline (`scorePhoto` → `quality_scores` table) exists but is never triggered on photo select — only during batch transformation. `GET /api/quality-scores/photo/[photoId]` returns stored scores. `scorePhoto()` uses `aiConfig.visionModel` = `"openai/gpt-4o"` with no model override path. `ScoreSidebar` already handles `null` with "Brak danych".
- **C-5**: `src/pages/api/objects/[objectId]/photos/[photoId].ts:33–35` reconstructs storage path by slicing last 3 URL segments from a public URL — violates `lessons.md:19–23`. `original_url` in DB is the full public URL set by `getPublicUrl()` (`photos/index.ts:105`). `user.id` and `objectId` are trusted values already in scope at the callsite.
- **C-8**: `transformation-processor.ts:97–99` creates 24h signed URLs, stores only the URL in `transformations.result_url`. `transformed-photos` bucket is private; no `result_storage_path` column exists; no refresh endpoint exists. Path is deterministic: `${job.user_id}/${job.object_id}/${job.id}/full.jpg`.

## Desired End State

Selecting a photo in EditorShell shows real quality metrics in "Ocena przed" within seconds (LLM-computed on first select, DB-cached thereafter). Photo deletion reliably removes the correct file from storage. Saved transformations remain viewable indefinitely — a refresh endpoint re-signs the stored path on demand when `result_url` has expired.

### Key Discoveries

- `scorePhoto()` is the right function — adding an optional `model` param makes it reusable for cheap preview scoring without touching existing callers.
- `original_url` in `photos` table is confirmed as full public URL (output of `getPublicUrl()` in `photos/index.ts:105`) — usable directly as image URL for vision API; no signed URL generation needed in the POST endpoint.
- `quality_scores` INSERT schema known from `analyzeObject:253–271`: `user_id, photo_id, category, sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score, is_sales_ready`.
- `analyzeObject` has a latent bug treating `original_url` as a storage path for `createSignedUrl` — silently falls back to the public URL. This plan does NOT fix it.
- SSIM/MSE before→after comparison: deferred — meaningful display requires UI additions outside this plan's scope.

## What We're NOT Doing

- Service layer for `supabase.ts` (C-1) — needs test coverage as prerequisite
- `EditorShell` hook extraction (C-4) — needs component tests as prerequisite
- Double ownership check removal in `analyzeObject` (C-6) — low user value without test coverage
- Race condition full fix — Supabase RPC + deadlock testing needed (C-7)
- SSIM/MSE client-side computation — deferred (requires UI changes to display)
- `analyzeObject` signed URL bug fix — out of scope
- BRISQUE/NIQE pure-JS implementation — LLM approach fills all 8 semantic fields; pixel-only metrics cannot

## Implementation Approach

Three independent phases, each deployable and verifiable alone. No cross-phase dependencies.

## Critical Implementation Details

**Cache logic in POST endpoint (Phase 1):** The quality of the original photo never changes (the file is immutable after upload). Any existing `quality_scores` row for a `photo_id` is valid to return — no TTL needed. Cache check: `SELECT ... WHERE photo_id = photoId ORDER BY scored_at DESC LIMIT 1` — if a row exists, return it without calling the LLM.

**`original_url` is a full public URL, not a storage path:** Do not call `createSignedUrl` on it. Pass it directly to `scorePhoto` as the image URL for the vision API call.

---

## Phase 1: C-3 — On-demand quality scoring for "Ocena przed"

### Overview

Wire real quality data into `EditorShell`'s "Ocena przed" panel. A cheap vision model is called once per photo (on first select); result is cached in `quality_scores`. Subsequent selects hit the DB cache via GET.

### Changes Required

#### 1. `src/lib/config.ts`

**File**: `src/lib/config.ts`

**Intent**: Add `previewModel` to `aiConfig` — the cheap vision model used for on-demand EditorShell scoring, kept separate from `visionModel` (GPT-4o, used in batch transformation scoring).

**Contract**: Add `previewModel: "google/gemini-2.0-flash-lite"` inside the existing `aiConfig` const. camelCase per `lessons.md` naming rule.

---

#### 2. `src/lib/quality-scoring.ts`

**File**: `src/lib/quality-scoring.ts`

**Intent**: Add an optional `model` param to `scorePhoto` and `_callGptVision` so callers can pass a cheaper model without changing default behavior for existing callers.

**Contract**: Update `_callGptVision` to accept `model = aiConfig.visionModel` as a fourth param; use it instead of the hardcoded `aiConfig.visionModel` in the `body: JSON.stringify(...)` call. Update `scorePhoto` signature to `scorePhoto(signedUrl: string, category: ObjectCategory, model = aiConfig.visionModel)` and pass `model` to `_callGptVision`. All existing callers (`analyzeObject`, etc.) remain unchanged.

---

#### 3. `src/pages/api/quality-scores/photo/[photoId].ts`

**File**: `src/pages/api/quality-scores/photo/[photoId].ts`

**Intent**: Add a `POST` export that triggers on-demand quality scoring. Returns a cached score if one already exists for the photo; otherwise calls `scorePhoto` with the cheap model, inserts to `quality_scores`, and returns the snapshot.

**Contract**:
- Export `POST: APIRoute` alongside the existing `GET` export (same file, Astro supports multiple HTTP method exports per route).
- Auth + supabase guard — same pattern as GET lines 6–18.
- SELECT `photos` for `id, original_url, object_id` WHERE `id = photoId AND user_id = userId` — 404 if not found.
- SELECT `quality_scores` for all score fields WHERE `photo_id = photoId` ORDER BY `scored_at DESC` LIMIT 1 — if found, return `{ score: QualityScoreSnapshot }` immediately (cache hit, no LLM call).
- SELECT `objects` for `category` WHERE `id = photo.object_id AND user_id = userId` — default `"item"` if row missing.
- Call `scorePhoto(photo.original_url, category, aiConfig.previewModel)`.
- INSERT into `quality_scores` with shape from `analyzeObject:255–269`: `{ user_id, photo_id, category, sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score: snapshot.overall, is_sales_ready }`.
- Return `{ score: QualityScoreSnapshot }` status 200.
- On `scorePhoto` throw: return 502 `{ error: "Scoring failed" }`.

---

#### 4. `src/components/editor/EditorShell.tsx`

**File**: `src/components/editor/EditorShell.tsx`

**Intent**: Replace `MOCK_SCORE_BEFORE` with real state driven by photo selection. Guest users always receive null (no DB, no auth). Trigger GET-then-POST fetch pattern on `selectedPhoto` change.

**Contract**:
- Add `const [scoreBefore, setScoreBefore] = useState<QualityScoreSnapshot | null>(null)` near the `scoreAfter` state declaration.
- Add `useEffect` keyed on `selectedPhoto?.id` (derive the id — EditorShell already holds `photos[selectedPhotoIndex]`):
  - If no selected photo or user is in guest mode: `setScoreBefore(null); return`.
  - `setScoreBefore(null)` to reset on photo change.
  - `GET /api/quality-scores/photo/${selectedPhoto.id}` — if 200: `setScoreBefore(data.score)` and return.
  - If 404: `POST /api/quality-scores/photo/${selectedPhoto.id}` (no body) — if 200: `setScoreBefore(data.score)`.
  - Any other error: leave as null (sidebar shows "Brak danych" — honest fallback).
- Line 686: replace `scoreBefore={MOCK_SCORE_BEFORE}` → `scoreBefore={scoreBefore}`.
- Remove line 2: `import { MOCK_SCORE_BEFORE } from "@/data/mockEditorData"`.

---

#### 5. `src/data/mockEditorData.ts`

**File**: `src/data/mockEditorData.ts`

**Intent**: Remove `MOCK_SCORE_BEFORE` now that it has no consumer. Keep `MOCK_SCORE_AFTER` and the `QualityScoreSnapshot` import (still used by `MOCK_SCORE_AFTER`).

**Contract**: Delete the `export const MOCK_SCORE_BEFORE: QualityScoreSnapshot = { ... }` block (lines 39–50). Retain the `import type { QualityScoreSnapshot }` on line 2 — still needed for `MOCK_SCORE_AFTER`.

---

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Select a photo in EditorShell (authenticated) → "Ocena przed" shows "Brak danych" briefly, then fills with real 8-dimension scores (first load may take 2–5s for LLM call).
- Re-select the same photo immediately → scores appear instantly (cache hit, no network delay).
- Select a different photo → panel resets to "Brak danych" then fills with that photo's scores.
- Guest mode (unauthenticated) → "Ocena przed" permanently shows "Brak danych"; no network errors in console.
- Hardcoded mock value 5.8 never appears in "Ocena przed" panel.

**Implementation Note**: Pause here for manual confirmation before Phase 2.

---

## Phase 2: C-5 — Storage path from trusted values

### Overview

Fix brittle `slice(-3)` path extraction in the photo DELETE endpoint. Reconstruct from trusted context values per the documented `lessons.md` rule.

### Changes Required

#### 1. Prerequisite — Verify live DB `original_url` format

**Intent**: Confirm no `photos` row predates the `20260601000001` migration (which switched to public URLs). If pre-migration rows with signed URLs exist, the fix needs a conditional guard; if all rows are public-URL format, the fix is unconditional.

**Contract**: Query via Supabase MCP or dashboard:
```sql
SELECT original_url FROM photos ORDER BY created_at ASC LIMIT 5;
```
Verify all returned URLs start with `https://.../object/public/original-photos/`. If so, proceed unconditionally. If any start with a token-style signed URL, raise before touching the code.

---

#### 2. `src/pages/api/objects/[objectId]/photos/[photoId].ts`

**File**: `src/pages/api/objects/[objectId]/photos/[photoId].ts`

**Intent**: Reconstruct the Supabase storage path from trusted in-scope values instead of slicing a public URL, eliminating the fragility flagged by `lessons.md:19–23`.

**Contract**: Replace lines 32–35:

```typescript
// OLD
const urlObj = new URL(photo.original_url);
const segments = urlObj.pathname.split("/").filter(Boolean);
const storagePath = segments.slice(-3).join("/");

// NEW
const fileName = photo.original_url.split('/').at(-1)!;
const storagePath = `${user.id}/${objectId}/${fileName}`;
```

`user.id` is `context.locals.user.id`; `objectId` is `context.params.objectId`. Both are trusted, validated earlier in the route.

---

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Upload a photo via the editor, then delete it.
- Confirm in Supabase Storage dashboard that the file is removed from the `original-photos` bucket.
- Confirm the corresponding `photos` DB row is also deleted.
- No 500 error or silent storage leak.

**Implementation Note**: Pause here for manual confirmation before Phase 3.

---

## Phase 3: C-8 — Persistent result path + URL refresh endpoint

### Overview

Add `result_storage_path` column to `transformations` (additive, nullable), write the path during transformation, and expose `GET /api/transformations/[jobId]/result-url` to re-sign on demand. Components rendering saved transformation results call this endpoint instead of using the stale `result_url`.

### Changes Required

#### 1. DB Migration

**File**: `supabase/migrations/20260602000000_add_result_storage_path.sql`

**Intent**: Add `result_storage_path` to persist the Supabase storage path independently of the expiring signed URL.

**Contract**:
```sql
ALTER TABLE transformations ADD COLUMN result_storage_path TEXT;
```
Additive, nullable, no default. Existing rows get NULL (backfillable: `UPDATE transformations SET result_storage_path = user_id || '/' || object_id || '/' || id || '/full.jpg'`). Apply via `supabase db push` or Supabase dashboard SQL editor.

---

#### 2. `src/lib/transformation-processor.ts`

**File**: `src/lib/transformation-processor.ts`

**Intent**: Persist the storage path alongside `result_url` when a transformation completes, so the path is available for URL refresh after the signed URL expires.

**Contract**: Find the UPDATE on `transformations` (around line 105–115). Add `result_storage_path: fullPath` to the UPDATE payload. `fullPath` is already constructed at line ~84 as `` `${job.user_id}/${job.object_id}/${job.id}/full.jpg` ``.

---

#### 3. New file: `src/pages/api/transformations/[jobId]/result-url.ts`

**Intent**: Return a fresh 1h signed URL for a saved transformation, generated from the stored `result_storage_path`.

**Contract**:
- Export `GET: APIRoute`.
- Auth + supabase guard.
- SELECT `transformations` for `id, result_storage_path` WHERE `id = jobId AND user_id = userId` — 404 if not found.
- If `result_storage_path` is NULL: return 404 `{ error: "No storage path recorded" }`.
- `supabase.storage.from("transformed-photos").createSignedUrl(result_storage_path, 3600)` — 1h TTL.
- Return `{ url: signedUrl }` status 200.

// ponytail: always re-signs; add Cache-Control: max-age=3300 on response if refresh latency matters

---

#### 4. Callsite — components rendering saved transformation results

**Intent**: Replace stale `result_url` from DB with a fresh URL from the refresh endpoint wherever saved transformation images are rendered.

**Contract**: Locate component(s) that render `transformation.result_url` for saved rows (search for `result_url` usage in `src/components/editor/`). For each: on mount (or when the job id is known), call `GET /api/transformations/${jobId}/result-url` and use the returned `url` as the `<img src>`. If the endpoint returns 404, fall back to `result_url` from state (works within the first 24h of the session).

---

### Success Criteria

#### Automated Verification

- Migration applies cleanly (no error in Supabase dashboard or `supabase db push`).
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Complete a transformation and save it; check Supabase `transformations` table — `result_storage_path` is populated.
- Call `GET /api/transformations/[jobId]/result-url` in browser DevTools — confirm 200 with a valid signed URL containing `transformed-photos`.
- (Optional) Manually set a transformation's `result_url` to an expired/garbage value in DB, reload the page — confirm the image still renders via the refresh endpoint.

---

## Testing Strategy

### Manual Testing Steps

1. **Phase 1**: Authenticated user — select photo → watch "Ocena przed" populate with real data. Re-select → instant. Incognito / guest flow → "Brak danych" throughout.
2. **Phase 2**: Upload a test photo → note filename in Supabase Storage → delete via editor → confirm file gone.
3. **Phase 3**: Save a transformation → verify `result_storage_path` in DB → call refresh endpoint directly → confirm URL works.

## References

- Research: `context/changes/refactor-opportunities/research.md`
- Quality scoring: `src/lib/quality-scoring.ts:84–184`
- Storage path rule: `context/foundation/lessons.md:19–23`
- Transformation processor: `src/lib/transformation-processor.ts`
- Score INSERT shape: `src/lib/quality-scoring.ts:253–271`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: C-3 — On-demand quality scoring for "Ocena przed"

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 13e3742
- [x] 1.2 Build passes: `npm run build` — 13e3742

#### Manual

- [x] 1.3 Photo selection shows real quality scores (not mock 5.8) — 13e3742
- [x] 1.4 Re-select same photo → instant cache hit (no visible delay) — 13e3742
- [x] 1.5 Guest mode → "Brak danych" permanently, no console errors — 13e3742

### Phase 2: C-5 — Storage path from trusted values

#### Automated

- [x] 2.1 DB `original_url` format verified — all rows are public-URL format — 35b13b1
- [x] 2.2 Lint passes: `npm run lint` — 35b13b1
- [x] 2.3 Build passes: `npm run build` — 35b13b1

#### Manual

- [x] 2.4 Photo upload + delete → file removed from `original-photos` bucket — 35b13b1

### Phase 3: C-8 — Persistent result path + URL refresh endpoint

#### Automated

- [x] 3.1 Migration applies cleanly — 9ada6cc
- [x] 3.2 Lint passes: `npm run lint` — 9ada6cc
- [x] 3.3 Build passes: `npm run build` — 9ada6cc

#### Manual

- [x] 3.4 `result_storage_path` populated in `transformations` after save — 9ada6cc
- [x] 3.5 `GET /api/transformations/[jobId]/result-url` returns 200 with valid URL — 9ada6cc
- [x] 3.6 Result image renders via refresh endpoint (stale `result_url` scenario) — 9ada6cc
