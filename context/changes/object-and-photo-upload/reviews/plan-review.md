<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Object Creation and Photo Upload

- **Plan**: `context/changes/object-and-photo-upload/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical | 2 warnings | 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

9/9 paths ✓ (config.ts, supabase.ts, database.generated.ts, dashboard.astro, FormField.tsx, SubmitButton.tsx, ServerError.tsx, button.tsx, initial_schema.sql); 5/5 symbols ✓ (Max_Client_Repository, allowedPhotoMimeTypes, maxSinglePhotoBytes, createClient, objects.version:string); brief↔plan ✓

## Findings

### F1 — Phase 1 migration drops a policy that doesn't exist separately

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — New Supabase migration
- **Detail**: The plan assumed separate read/write storage policies. The actual migration (`initial_schema.sql` line 296–305) has a single `FOR ALL` policy — `"original-photos owner"`. Dropping it would remove write protection. No policy change is needed: for public buckets, Supabase bypasses RLS for public URL reads automatically. The correct migration is only `UPDATE storage.buckets SET public = true WHERE name = 'original-photos';`.
- **Fix Applied**: Fix A — Removed the policy drop instruction from Phase 1 migration spec. The existing `FOR ALL` policy remains untouched; `WITH CHECK` continues to protect writes.
- **Decision**: FIXED (Fix A)

### F2 — Delete route: Storage removed before DB row; partial failure leaves stale quota

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Delete photo
- **Detail**: Original order: `storage.remove` then `DELETE photos row`. If Storage succeeds but DB DELETE fails: stale DB row persists, quota trigger never fires, `storage_used_bytes` stays inflated. Reversed order makes DB the source of truth — quota always correct, orphaned file on Storage failure matches the already-accepted upload-confirm orphan risk.
- **Fix Applied**: Reversed the order — DELETE DB row first, then storage.remove. Added note that Storage failure produces an orphaned file (same accepted risk as upload-confirm failures).
- **Decision**: FIXED (Fix A)

### F3 — Same-named uploads overwrite each other and inflate quota

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Signed upload URL
- **Detail**: Path `${userId}/${objectId}/${fileName}` is not unique across uploads. Two files named `product.jpg` produce the same path; Storage overwrites silently; DB gets two rows pointing to the same URL; quota trigger fires for both INSERTs, inflating `storage_used_bytes` for phantom bytes.
- **Fix Applied**: UUID-prefixed filename in storage path: `const safeName = \`${crypto.randomUUID()}_${fileName}\`; const path = \`${userId}/${objectId}/${safeName}\``. Updated upload-url route contract and noted browser must echo the exact path back to the confirm route.
- **Decision**: FIXED (Fix A)

### F4 — Photo count race undocumented; inconsistency vs quota race treatment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Quota race condition
- **Detail**: Plan documented the quota race and its DB-level hard enforcement. The 10-photo count limit has the same race but no DB backstop and no acknowledgement.
- **Fix Applied**: Added one sentence to the quota race paragraph acknowledging the photo count soft guard has no DB backstop; same race is accepted for MVP.
- **Decision**: FIXED

### F5 — Public URL constructed manually; SDK's getPublicUrl() is more robust

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Confirm upload; Critical Implementation Details
- **Detail**: Manual URL construction `${SUPABASE_URL}/storage/v1/object/public/original-photos/${path}` is fragile and required the delete route to reverse-parse the URL. The SDK's `getPublicUrl(path)` is the idiomatic approach.
- **Fix Applied**: Updated confirm route contract and Critical Implementation Details to use `supabase.storage.from('original-photos').getPublicUrl(path).data.publicUrl`.
- **Decision**: FIXED
