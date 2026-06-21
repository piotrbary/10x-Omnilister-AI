<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Analysis & Quality Score

- **Plan**: context/changes/ai-analysis-score/plan.md
- **Scope**: All Phases (1–4)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 6 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — analyzeObject category-update logic deviates from plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/quality-scoring.ts:225–239
- **Detail**: The plan states "If objects.category is NULL, uses the category from the first fulfilled result. Updates objects.features_text from the first fulfilled result." The implementation adds an undocumented guard: category is only written when the current DB value is NULL (preserving user-set categories). features_text is always updated. The guard is defensively reasonable but undocumented.
- **Fix A ⭐ Recommended**: Accept and document — note the guard in plan.md as a Known Drift addendum and add a code comment.
  - Strength: Preserves sensible guard; updates source of truth.
  - Tradeoff: Plan becomes slightly moving target.
  - Confidence: HIGH — the guard is the right behavior.
  - Blind spot: S-03 callers who expect category to always refresh are not notified.
- **Fix B**: Remove the guard; always overwrite category.
  - Strength: Aligns with plan contract.
  - Tradeoff: User-corrected category silently overwritten on re-analysis.
  - Confidence: LOW — regresses UX intentionally.
  - Blind spot: None.
- **Decision**: PENDING

### F2 — photo_ids array has no upper-bound limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/objects/[objectId]/analyze.ts:7
- **Detail**: `AnalyzeBodySchema` uses `.min(1)` but no `.max()`. Each photo fires up to 3 GPT-4o vision calls. Unbounded input can exhaust Cloudflare Worker CPU and OpenRouter spend. `StartTransformationRequestSchema` already uses `.max(10)`.
- **Fix**: Add `.max(storageConfig.maxPhotosPerObject)` to the `photo_ids` validator.
- **Decision**: PENDING

### F3 — Sequential signed-URL generation (N+1 storage round-trips)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/quality-scoring.ts:199–205
- **Detail**: Signed URLs created in a sequential `for...of` loop — one Supabase Storage round-trip per photo before analysis begins. 10 photos = 10 serial awaits.
- **Fix A ⭐ Recommended**: Use bulk `createSignedUrls` API — single round-trip, also fixes F4 TTL if set to 300s.
  - Strength: Single round-trip; fixes F4 simultaneously.
  - Tradeoff: Need to handle per-item errors in the response array.
  - Confidence: HIGH — Supabase JS SDK supports `createSignedUrls`.
  - Blind spot: Confirm paths vs full URLs stored in original_url.
- **Fix B**: Parallelize with `Promise.all` over individual `createSignedUrl` calls.
  - Strength: Parallel; idiomatic.
  - Tradeoff: Still N HTTP requests.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: PENDING

### F4 — Signed URL TTL (60 s) too short for retry window

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/quality-scoring.ts:203
- **Detail**: 60s TTL with up to 3 retry attempts of 10–30s each. URL may expire before the last retry, causing a 403 from CDN indistinguishable from a model error.
- **Fix**: Increase TTL to 300s in `createSignedUrl(path, 300)`. Resolved automatically if F3 Fix A is applied.
- **Decision**: PENDING

### F5 — Object row fetch in analyzeObject silently ignores DB errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/quality-scoring.ts:189–196
- **Detail**: `const { data: objectRow } = await supabase.from("objects")...` discards `error`. On DB failure `objectRow` is silently `null`, `knownCategory` defaults to `"item"`, and analysis proceeds with the wrong category. The DB fetch is also redundant — the calling endpoint already verified ownership.
- **Fix A ⭐ Recommended**: Add `knownCategory: ObjectCategory | null = null` parameter; remove the re-fetch.
  - Strength: Eliminates silent failure path and redundant DB query.
  - Tradeoff: Minor signature change; callers must pass category.
  - Confidence: HIGH — route already fetches the object for ownership check.
  - Blind spot: None significant.
- **Fix B**: Destructure and throw on DB error.
  - Strength: Minimal change; keeps existing signature.
  - Tradeoff: Still performs redundant round-trip.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: PENDING

### F6 — Stale closure in handleCategoryChange (not memoized)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/AnalysisSection.tsx:304
- **Detail**: `handleCategoryChange` is not wrapped in `useCallback`. Rapid double-invocation captures stale `prevCategory`, reverting to the wrong value on error. `runAnalysis` already uses `useCallback` correctly.
- **Fix**: Wrap in `useCallback([category, objectId])`.
- **Decision**: PENDING

### F7 — category.ts returns 404 for all Supabase errors (masks 5xx)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/objects/[objectId]/category.ts:57
- **Detail**: All Supabase errors mapped to 404, including internal DB errors. Existing routes use 500 for infrastructure errors, 404 only for PGRST116.
- **Fix**: Check `error.code === "PGRST116"` for 404; return 500 for other errors.
- **Decision**: PENDING

### F8 — AnalyzeBodySchema duplicates the exported AnalyzeRequestSchema

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/objects/[objectId]/analyze.ts:7 vs src/types/analysis.ts:32
- **Detail**: `analyze.ts` defines a local schema that duplicates the exported `AnalyzeRequestSchema`. The canonical schema is unused.
- **Fix**: Remove `AnalyzeBodySchema`; import `AnalyzeRequestSchema` from `@/types/analysis` (add `.max(10)` there per F2).
- **Decision**: PENDING

### F9 — analyzeObject has no unit test coverage

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; real tradeoff or non-trivial edit
- **Dimension**: Pattern Consistency
- **Location**: src/lib/quality-scoring.test.ts
- **Detail**: Tests cover `scorePhoto` only. `analyzeObject` (signed URL generation, parallel scoring, DB inserts, category/features update guard) has zero automated coverage. Partial-success path is entirely untested.
- **Fix**: Add tests mocking `supabase` covering: all succeed, partial failure, full failure.
- **Decision**: PENDING

### F10 — Test expected values hardcode arithmetic instead of deriving from config

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/quality-scoring.test.ts:27–56
- **Detail**: Tests hardcode `overall` values (7.00, 6.88, 6.75). If `categoryWeights` gains non-uniform values, expected values silently break.
- **Fix**: Derive expected `overall` from `scoringConfig.categoryWeights` inside tests.
- **Decision**: PENDING
