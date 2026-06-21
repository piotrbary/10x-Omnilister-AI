<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Analysis & Quality Score (S-02)

- **Plan**: `context/changes/ai-analysis-score/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: SOUND (after fixes)
- **Findings**: 1 critical  2 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | FAIL → FIXED |
| Blind Spots | WARNING → FIXED |
| Plan Completeness | WARNING → FIXED |

## Grounding

5/5 existing paths ✓, 5/5 symbols ✓, brief↔plan phases ✓ — KEY DISCREPANCY at review time:
brief showed 2-param scorePhoto correctly; plan body had drifted to 5-param. Fixed.

## Findings

### F1 — `scorePhoto` 5-param signature breaks S-03 contract + FK violation at runtime

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — quality-scoring.ts contract
- **Detail**: S-03's plan (lines 222–225, 55, 279) defines scorePhoto(signedUrl, category) — 2-param
  pure function. S-02's plan originally defined 5 params + DB INSERT side effect. Two failure modes:
  (1) TypeScript compile error in S-03's background processor; (2) FK violation at runtime —
  transformed photos have no photos table row, so quality_scores.photo_id FK rejects the INSERT.
- **Fix A ⭐ Applied**: Made scorePhoto a pure 2-param function (no DB write, no supabase/photoId/userId).
  analyzeObject owns all DB persistence (INSERT to quality_scores). S-03 calls scorePhoto(result_url,
  category) and stores the result in transformations.score_after. Unit tests no longer need a DB mock.
- **Decision**: FIXED via Fix A

---

### F2 — Promise.all drops ALL photo results on single failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 (analyzeObject) + Phase 4 criterion 4.5
- **Detail**: Phase 4 criterion 4.5 requires "per-photo error state; other photos unaffected." But
  analyzeObject used Promise.all — any single scorePhoto failure after maxRetries discards all
  successfully-computed scores for the batch.
- **Fix A ⭐ Applied**: Changed analyzeObject to use Promise.allSettled. Per-photo results are
  PhotoScoreResult (success | error union type). ObjectAnalysisResult.photoScores carries both.
  Phase 3's POST /analyze response returns 200 with per-photo results; 500 only if ALL photos fail.
- **Decision**: FIXED via Fix A

---

### F3 — AnalysisSection props missing initialScores — criterion 4.3 unimplementable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — AnalysisSectionProps contract + criterion 4.3
- **Detail**: Criterion 4.3 requires cached score display without a new API call. Component props
  had no initialScores field — no way to seed cached scores without a fetch-on-mount.
- **Fix Applied**: Added `initialScores?: Record<string, QualityScoreSnapshot>` to AnalysisSectionProps.
  Phase 4 integration note now documents the SQL query S-01's Astro page must run to populate it
  (DISTINCT ON photo_id, ordered by scored_at DESC).
- **Decision**: FIXED

---

### F4 — Plan prose uses "overall_score"; canonical TypeScript type uses "overall"

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details; scoringConfig comment; unit test descriptions
- **Detail**: QualityScoreSnapshot.overall (src/types/transformations.ts:15). Plan prose said
  "overall_score is the arithmetic mean" — would guide implementer to produce wrong field name.
  DB column is overall_score; TS field is overall; the mapping is a one-liner.
- **Fix Applied**: Updated all prose references to clarify "overall (TypeScript) / overall_score (DB)".
  scoringConfig comment updated. Unit test specs updated.
- **Decision**: FIXED
