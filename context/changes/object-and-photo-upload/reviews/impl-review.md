<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Object Creation and Photo Upload

- **Plan**: context/changes/object-and-photo-upload/plan.md
- **Scope**: All 3 Phases
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 4 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Confirm-upload path not validated against user prefix

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/objects/[objectId]/photos/index.ts:105
- **Detail**: The confirm-upload POST accepts `{ path }` from the client and passes it directly to `getPublicUrl(path)` then inserts `original_url` into `photos`. The route verifies `objectId` ownership but never checks that `path` starts with `${user.id}/${objectId}/`. A caller can POST `{ path: "victim-uid/victim-obj/file.jpg" }` to register another user's storage URL in their own gallery — cross-user URL hijacking.
- **Fix A ⭐ Recommended**: Add `if (!path.startsWith(\`${user.id}/${objectId}/\`)) return 422` before `getPublicUrl`.
  - Strength: One-line guard, closes the IDOR completely. Valid path always has this prefix.
  - Tradeoff: None.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Reconstruct path server-side from DB after upload (ignore client path).
  - Strength: Removes client-controlled input entirely.
  - Tradeoff: Requires Storage list API round-trip; larger change.
  - Confidence: MED
  - Blind spot: Race if Storage hasn't flushed.
- **Decision**: ACCEPTED-AS-RULE: Validate client-provided storage paths before use

### F2 — Storage path reconstruction in delete is fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/objects/[objectId]/photos/[photoId].ts:33-35
- **Detail**: The delete route reconstructs the storage path by parsing `original_url` and taking `segments.slice(-3).join('/')`. If Supabase URL format changes, CDN rewrites paths, or a filename contains URL-decoded slashes, `slice(-3)` produces a wrong path — file gets orphaned while the DB row (and quota) are already deleted.
- **Fix**: `const fileName = photo.original_url.split('/').at(-1)!; const storagePath = \`${user.id}/${objectId}/${fileName}\`;`
  - Strength: `.at(-1)` is stable regardless of prefix segment count.
  - Tradeoff: Still relies on filename being the last segment (always true in Supabase).
  - Confidence: HIGH
  - Blind spot: URL-encoded slashes in filename (impossible from browser File API).
- **Decision**: ACCEPTED-AS-RULE: Reconstruct storage paths from trusted values, not public URLs

### F3 — Sibling-change files bundled into Phase 2 commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit 4ad5ddb
- **Detail**: Phase 2 commit includes files from `ai-analysis-score`: `src/types/analysis.ts`, `supabase/migrations/20260601000002_add_objects_features_text.sql`, and `aiConfig`/`scoringConfig` in `src/lib/config.ts`. Inflates diff, complicates bisect.
- **Fix**: Accept as-is (already committed). Follow stage-by-path discipline on future phases.
- **Decision**: ACCEPTED-AS-RULE: Stage only the change's own files at commit time

### F4 — DELETE statement omits object_id filter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/objects/[objectId]/photos/[photoId].ts:38
- **Detail**: Initial SELECT uses `.eq("id").eq("object_id").eq("user_id")`. DELETE at line 38 uses only `.eq("id").eq("user_id")` — drops the `object_id` filter. Pre-flight SELECT makes this safe in practice but the URL contract is not enforced at the delete layer.
- **Fix**: Add `.eq("object_id", objectId)` to the DELETE statement at line 38.
- **Decision**: ACCEPTED-AS-RULE: Mirror all WHERE filters from SELECT to DELETE/UPDATE

### F5 — Photos GET missing objectId ownership pre-check

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/objects/[objectId]/photos/index.ts:47
- **Detail**: Photos GET queries with `.eq("object_id").eq("user_id")` but never verifies the `objectId` belongs to the requesting user first. Returns `{ photos: [] }` for a foreign objectId instead of 404, inconsistent with sibling routes.
- **Fix**: Add object ownership SELECT before the photos query (pattern from `[objectId]/index.ts:55-64`).
- **Decision**: ACCEPTED-AS-RULE: Always pre-check object ownership before querying child resources

### F6 — Concurrent uploads race the photo count guard

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/objects/PhotoUploader.tsx:124-133
- **Detail**: `handleFiles` fires `void uploadFile(file)` for all selected files concurrently (no cap). 10 simultaneous uploads all race the soft photo count check. Plan explicitly accepts this race for MVP.
- **Fix**: Process uploads sequentially or cap concurrency at 2-3 before public launch.
- **Decision**: ACCEPTED-AS-RULE: Soft-guard races compound under concurrent client uploads

### F7 — Photos queries missing user_id filter in some places

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/objects/[objectId].astro:41 · src/pages/api/objects/[objectId]/index.ts:66 · upload-url.ts:83
- **Detail**: Three photos queries omit `.eq("user_id", user.id)`. All rely on `object_id` being pre-verified. RLS protects at DB level but inconsistency makes future audits harder.
- **Fix**: Add `.eq("user_id", user.id)` to each of the three queries.
- **Decision**: ACCEPTED-AS-RULE: Apply user_id filter on every query, even when ownership is implied

### F8 — Max_Client_Repository deviates from camelCase convention

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/config.ts:9 · src/pages/api/objects/[objectId]/photos/upload-url.ts:78
- **Detail**: `storageConfig.Max_Client_Repository` and `Max_Client_Repository_Label` use PascalCase_snake while all other keys are camelCase. Pre-dates this change but referenced by it.
- **Fix**: Rename to `maxClientRepositoryBytes` / `maxClientRepositoryLabel` and update the one callsite.
- **Decision**: ACCEPTED-AS-RULE: Config keys must follow camelCase to avoid mistype risk
