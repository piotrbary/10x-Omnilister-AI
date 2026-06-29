# Frame Brief: result_storage_path "missing column"

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Two typecheck errors reference `result_storage_path` on the `transformations`
table — written at `src/lib/transformation-processor.ts:110`, read at
`src/pages/api/transformations/[jobId]/result-url.ts:31` — but the column
appears in **no repo migration** and is absent from
`src/types/database.generated.ts`. These errors block a full `npx stryker run`.

## Initial Framing (preserved)

- **User's stated cause or approach**: The column is missing — it was never
  created; the full-res download endpoint is broken (404).
- **User's proposed direction**: Add a migration + regenerate types + deploy,
  or reconstruct the path from trusted values per the `lessons.md` rule.
- **Pre-dispatch narrowing**: Scope = "just fix the broken download" (not a
  design revisit). Evidence basis = "inferred from code/types", **not**
  reproduced in a running environment.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Live schema** — the column genuinely does not exist in the production DB;
   the code writes/reads a column that was never created.  ← initial framing
2. **Application code** — code is wrong; the path should be reconstructed from
   trusted values (`${user_id}/${object_id}/${id}/full.jpg`) instead of a
   stored column.
3. **Migration + type drift** — the column *does* exist in the live DB, but the
   migration that created it was never committed to the repo and types were
   never regenerated.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Live schema missing the column (initial framing) | `information_schema.columns` on the live project (`kpplmltwctkfwrdtllez`) shows `result_storage_path text` present on `transformations`. | NONE |
| 2. Code wrong; reconstruct path instead | Path at `transformation-processor.ts:84` is `${user_id}/${object_id}/${id}/full.jpg` — reconstructible. But the column exists, the `update` succeeds in prod, and the download works. Reconstruction is unnecessary; code is correct. | NONE |
| 3. Migration + type drift | Remote `supabase_migrations.schema_migrations` contains `20260626135427 add_result_storage_path` (DDL: `ALTER TABLE transformations ADD COLUMN result_storage_path TEXT;`) with **no matching file** in `supabase/migrations/`. Generated types omit the column. | STRONG |

## Narrowing Signals

- The `update` at `transformation-processor.ts:105` has **no error check**, so a
  truly-missing column would make PostgREST reject the *entire* update (status →
  `full_ready` included) — transformations would never complete, an app-breaking
  bug, not a mere 404. The app works → the column must exist in prod.
- Direct DB query confirmed the column exists (HIGH-certainty evidence, not a
  prior).
- Remote migration list vs repo `supabase/migrations/` diff: exactly one
  remote-only migration, `20260626135427_add_result_storage_path`, applied
  2026-06-26.

## Cross-System Convention

In this repo, every schema change is a committed file under
`supabase/migrations/` and types are regenerated into
`src/types/database.generated.ts`. The leading hypothesis (drift) is precisely a
violation of that convention — one migration was applied to remote out-of-band
and never captured. The fix restores the convention; it does not change prod.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: repo migration history and generated
> types have **drifted** from the live database — a `result_storage_path` column
> was added to prod via an uncommitted, remote-only migration
> (`20260626135427`) and types were never regenerated. The full-res download is
> **not** broken in production.

The original framing ("missing column / broken download") is incorrect. Nothing
is broken at runtime; the symptom is purely a build-time type mismatch caused by
drift. Addressing it means making the repo *describe* what already exists in
prod, so fresh clones, local Supabase (Phase 3 of the test-harness rollout), and
CI all get the column — and the typecheck/Stryker errors clear.

## Confidence

- **HIGH** — direct DB evidence (column present + orphaned remote migration with
  exact DDL), matches the drift hypothesis, contradicts the initial framing, and
  the narrowing signal (no-error-check update would otherwise break the app) is
  decisive. No reproduction needed; the DB *is* the ground truth.

## What Changes for /10x-plan

The plan is **drift reconciliation, not a feature fix**: (1) add the missing repo
migration file `supabase/migrations/20260626135427_add_result_storage_path.sql`
with `ALTER TABLE transformations ADD COLUMN IF NOT EXISTS result_storage_path
TEXT;` (idempotent — a no-op against prod where it already exists); (2) regenerate
`src/types/database.generated.ts` to clear the two typecheck errors. **No prod
schema change, no Supabase redeploy, no application-code change.** Optional
low-cost guard: diff full live schema vs repo migrations to confirm this column
is the *only* drift.

## References

- Source files: `src/lib/transformation-processor.ts:84,105-116`,
  `src/pages/api/transformations/[jobId]/result-url.ts:22,31`
- Live schema: project `kpplmltwctkfwrdtllez`, table `public.transformations`
- Orphaned migration: remote `20260626135427_add_result_storage_path`
  (`ALTER TABLE transformations ADD COLUMN result_storage_path TEXT;`)
- Related lesson: `context/foundation/lessons.md` — "Reconstruct storage paths
  from trusted values" (considered and ruled out: column already exists, code works)
- Investigation: inline (small surface, no sub-agents spawned)
