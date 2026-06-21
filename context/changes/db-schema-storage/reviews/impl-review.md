<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: DB Schema and Storage

- **Plan**: context/changes/db-schema-storage/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-05-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 6 warnings | 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Storage counter can go negative

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:42,67
- **Detail**: Both decrement paths blindly subtract without a floor. If storage_used_bytes is already 0 (manual service-role reset, prior bug), the subtraction persists a negative BIGINT, permanently breaking the 100 MB quota gate for that user.
- **Fix A ⭐ Recommended**: Add `CONSTRAINT storage_nonneg CHECK (storage_used_bytes >= 0)` to profiles. Strength: catches every path. Tradeoff: raises error rather than clamping. Confidence: HIGH. Blind spot: None significant.
- **Fix B**: Use `GREATEST(..., 0)` in trigger decrements. Strength: silent floor. Tradeoff: hides root cause. Confidence: MEDIUM.
- **Decision**: FIXED via Fix A — supabase/migrations/20260530000001_add_storage_nonneg_check.sql

### F2 — Null result_file_size_bytes enables quota bypass when saving a transformation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:170
- **Detail**: `result_file_size_bytes BIGINT` is nullable. Trigger uses COALESCE(..., 0), so saving a transformation with NULL file size contributes 0 bytes — silently bypassing the 100 MB cap.
- **Fix**: Add `CONSTRAINT result_size_required_when_saved CHECK (status != 'saved' OR result_file_size_bytes IS NOT NULL)`. Strength: DB-level enforcement. Tradeoff: requires new migration. Confidence: HIGH. Blind spot: existing rows.
- **Decision**: FIXED — supabase/migrations/20260530000002_add_transformation_result_size_check.sql

### F3 — Generated TypeScript types are orphaned — Supabase client untyped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase.ts:9
- **Detail**: `createServerClient(...)` called without `<Database>` generic. All supabase.from() calls return `any`. database.generated.ts is never imported — dead code.
- **Fix**: Import `Database` type in supabase.ts and pass as generic to createServerClient. Strength: activates typed queries across the whole app. Tradeoff: surfaces latent type errors. Confidence: HIGH. Blind spot: other client creation sites.
- **Decision**: FIXED — src/lib/supabase.ts: added Database generic to createServerClient

### F4 — auth.users trigger is fragile; no self-heal if trigger stops firing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:96
- **Detail**: `on_auth_user_created` fires on auth.users INSERT (Supabase-managed schema). If Supabase restricts auth schema triggers in a version upgrade, new users will have no profiles row; all downstream RLS/storage triggers fail opaquely.
- **Fix A ⭐ Recommended**: Add ON CONFLICT DO NOTHING to trigger INSERT + add application-level profile upsert in post-auth session setup. Strength: self-healing. Tradeoff: one extra DB call per first request. Confidence: HIGH. Blind spot: edge function auth flows.
- **Fix B**: Accept risk + add monitoring alert for auth.users rows with no matching profiles row. Strength: no code change. Tradeoff: users broken until alert fires. Confidence: LOW.
- **Decision**: FIXED via Fix A — supabase/migrations/20260530000003_harden_profile_trigger.sql + app-layer upsert comment in src/lib/supabase.ts

### F5 — Fallthrough RETURN NULL in transformation trigger is unreachable dead code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:73
- **Detail**: Line 73 `RETURN NULL` is unreachable — UPDATE branch returns at 64, DELETE branch returns at 71. Misleads maintainers into thinking INSERT could reach this path.
- **Fix**: Replace with `RAISE EXCEPTION 'unexpected TG_OP: %', TG_OP;` so accidental misuse fails loudly.
- **Decision**: FIXED — supabase/migrations/20260530000004_fix_transformation_trigger_fallthrough.sql

### F6 — Storage RLS path contract is implicit; no DB-level enforcement of format

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:296–316
- **Detail**: No documented contract specifying the mandatory `{user_id}/{object_id}/{filename}` path format. A developer constructing a wrong path gets confusing 403s with no clear diagnosis.
- **Fix**: Document the mandatory path format in `docs/reference/contract-surfaces.md` and add an assertion comment in the upload helper. No migration change needed.
- **Decision**: FIXED — docs/reference/contract-surfaces.md created with storage path contract, storage_used_bytes accounting, and result_file_size_bytes requirement

### F7 — No index on quality_scores.user_id

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:272–278
- **Detail**: No index on user_id on quality_scores. User-level queries without photo filter will full-scan.
- **Fix**: Add `CREATE INDEX idx_quality_scores_user ON quality_scores(user_id);` in a follow-up migration if user-level score queries are needed.
- **Decision**: FIXED — supabase/migrations/20260530000005_add_quality_scores_user_index.sql

### F8 — objects.version is free-form TEXT with no format constraint

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:105
- **Detail**: `version TEXT NOT NULL DEFAULT '1'` accepts any string. Cannot be compared numerically without a cast.
- **Fix**: Change to `INTEGER NOT NULL DEFAULT 1` if sequential, or add a CHECK constraint for the expected format.
- **Decision**: FIXED — supabase/migrations/20260530000006_objects_version_to_integer.sql

### F9 — styles.usage_count is writable by the row owner via REST API

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:198,260–262
- **Detail**: The `styles update` RLS policy allows owners to UPDATE any column including usage_count. An owner could artificially inflate their style's usage count.
- **Fix**: Add a BEFORE UPDATE trigger raising an exception if `NEW.usage_count != OLD.usage_count`. Or accept that cosmetic manipulation is acceptable and document the decision.
- **Decision**: FIXED — supabase/migrations/20260530000007_lock_styles_usage_count.sql

### F10 — Magic number 104857600 will silently diverge if config.ts changes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260530000000_initial_schema.sql:86
- **Detail**: CHECK value matches `storageConfig.Max_Client_Repository` now. If constant changes, migration will not update automatically.
- **Fix**: Add a comment in config.ts warning that changing Max_Client_Repository requires a new migration.
- **Decision**: FIXED — warning comment added to src/lib/config.ts next to Max_Client_Repository
