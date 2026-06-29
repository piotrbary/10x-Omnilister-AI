# result_storage_path Drift Reconciliation — Plan Brief

> Full plan: `context/changes/result-storage-path-missing-column/plan.md`
> Frame brief: `context/changes/result-storage-path-missing-column/frame.md`

## What & Why

Repo migration history and generated types have **drifted** from the live
database: a `result_storage_path` column was added to prod via an uncommitted,
remote-only migration (`20260626135427`) and types were never regenerated. The
full-res download is **not** broken in production — the only symptom is two
build-time typecheck errors that block `npx stryker run`. We make the repo
describe what prod already has.

## Starting Point

The column exists and works in prod (direct DB evidence). `result_storage_path`
is written at `transformation-processor.ts:110` and read at `result-url.ts:31`,
but lives in no committed migration and is absent from
`src/types/database.generated.ts`, causing TS2322 + TS2339.

## Desired End State

The repo carries an idempotent migration file matching the remote one, the
generated types include the column, `npm run typecheck` is green, and Stryker's
TypeScript-checker dry-run compiles. Fresh clones, local Supabase, and CI all get
the column. Nothing changes in prod.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Nature of the work | Drift reconciliation, not a feature fix | Column already exists in prod and code works; only the repo lags. | Frame |
| Reconstruct path vs stored column | Keep stored column | Frame ruled out reconstruction — the column exists and the update succeeds. | Frame |
| Migration idempotency | `ADD COLUMN IF NOT EXISTS` | No-op against prod, creates the column everywhere else. | Frame |
| Sibling-drift coverage | One-shot full-schema sweep | Out-of-band migration happened once; cheap to confirm it's the only one. | Plan |
| Done bar | Through full `npx stryker run` | Unblocking Stryker is the stated reason this change exists. | Plan |

## Scope

**In scope:**
- New migration file `20260626135427_add_result_storage_path.sql` (idempotent)
- Regenerate `src/types/database.generated.ts`
- One read-only full-schema drift sweep

**Out of scope:**
- Any prod schema change or Supabase/Worker redeploy
- Any application-code change
- Fixing *other* drift the sweep may surface (becomes a separate change)

## Architecture / Approach

Mirror the existing remote migration as a committed, idempotent file; regenerate
types from the linked DB (`kpplmltwctkfwrdtllez`, the source of truth) — not the
local config stub. Verify by clearing the two TS errors and confirming Stryker's
checker compiles.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Drift reconciliation & verification | Migration file + regenerated types + drift sweep, typecheck & Stryker green | Type regen must target the linked ref, not the local stub; filename must match the remote migration exactly |

**Prerequisites:** Supabase access to project `kpplmltwctkfwrdtllez` (CLI linked or Supabase MCP).
**Estimated effort:** ~1 short session, single phase.

## Open Risks & Assumptions

- Assumes `20260626135427` is the only remote-only migration — the sweep confirms this.
- Type regen overwrites the whole generated file; must run against the linked ref or it will produce a stale/wrong schema.

## Success Criteria (Summary)

- `npm run typecheck` passes; both TS2322/TS2339 cleared.
- `npx stryker run` proceeds past the TypeScript-checker dry-run.
- git diff touches only the migration file and `database.generated.ts`.
