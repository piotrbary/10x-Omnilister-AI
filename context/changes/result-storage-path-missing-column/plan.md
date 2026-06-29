# result_storage_path Drift Reconciliation Implementation Plan

## Overview

Repo migration history and generated types have **drifted** from the live
database. A `result_storage_path TEXT` column was added to the `transformations`
table in production via an out-of-band, remote-only migration
(`20260626135427_add_result_storage_path`) that was never committed to
`supabase/migrations/`, and `src/types/database.generated.ts` was never
regenerated. The runtime feature works; the only symptom is two build-time
typecheck errors that block `npx stryker run`.

This plan makes the repo *describe* what prod already has. It is **drift
reconciliation, not a feature fix** — no prod schema change, no Supabase
redeploy, no application-code change.

## Current State Analysis

- `result_storage_path` is written at `src/lib/transformation-processor.ts:110`
  (on the `full_ready` status update) and read at
  `src/pages/api/transformations/[jobId]/result-url.ts:31` (to mint a signed
  download URL).
- The column **exists in prod** (project `kpplmltwctkfwrdtllez`): direct
  `information_schema.columns` query confirms `result_storage_path text` on
  `public.transformations`. The download works in production.
- The remote migration list contains `20260626135427 add_result_storage_path`
  (DDL: `ALTER TABLE transformations ADD COLUMN result_storage_path TEXT;`),
  applied 2026-06-26, with **no matching file** in `supabase/migrations/`.
- Newest committed migration in repo is `20260602000001_remove_draft_concept.sql`
  — so the orphan would sort as the newest file.
- `src/types/database.generated.ts` omits the column, producing:
  - `transformation-processor.ts:110` — TS2322 `Type 'string' is not assignable to type 'never'`
  - `result-url.ts:31` — TS2339 `Property 'result_storage_path' does not exist`
- No npm script regenerates types; the project depends on the `supabase` CLI
  (`supabase` ^2.23.4) and the Supabase MCP server is available.

## Desired End State

- `supabase/migrations/20260626135427_add_result_storage_path.sql` exists in the
  repo, idempotent, a no-op when applied against prod (column already present)
  and the column-creating migration for fresh clones / local Supabase / CI.
- `src/types/database.generated.ts` includes `result_storage_path: string | null`
  on the `transformations` Row/Insert/Update types.
- `npm run typecheck` passes (both TS errors cleared).
- `npx stryker run`'s TypeScript-checker dry-run compilation succeeds.
- A full-schema drift sweep has confirmed this column is the **only** drift
  between live and repo (or surfaced any others for follow-up).

### Key Discoveries:

- The `update` at `transformation-processor.ts:105` has **no error check** — a
  genuinely-missing column would have broken the whole status transition, not
  just the download. The app working is itself proof the column exists. (frame.md)
- `config.toml` `project_id = "10x-astro-starter"` is the local stub name, **not**
  the linked ref; type regen targets project `kpplmltwctkfwrdtllez`.
- Migration filenames are `<timestamp>_<name>.sql`; matching the remote
  `20260626135427_add_result_storage_path` exactly keeps Supabase's migration
  bookkeeping consistent (no duplicate-apply on a `db push`).

## What We're NOT Doing

- Not changing the production schema (column already exists).
- Not redeploying the Worker / Supabase (no server-side code change, so the
  `npm run build && npm run deploy` gotcha does not apply here).
- Not changing any application code (`transformation-processor.ts`,
  `result-url.ts` are correct as written).
- Not reconstructing the path from trusted values per the `lessons.md` rule —
  considered and ruled out in the frame: the column exists and the code works.
- Not auto-fixing any *other* drift the sweep surfaces — those become separate
  changes; this plan only reconciles `result_storage_path`.

## Implementation Approach

Mirror the existing out-of-band migration as a committed, idempotent file, then
regenerate types from the linked DB (the source of truth). Because the column
already exists in prod, `IF NOT EXISTS` makes the migration safe to apply
anywhere. Verify by clearing the two typecheck errors and confirming Stryker's
checker compiles — the reason this change exists.

## Critical Implementation Details

- **Filename must match the remote migration exactly** —
  `20260626135427_add_result_storage_path.sql`. If a `supabase db push` ever
  runs, Supabase keys applied migrations by this version timestamp; a mismatched
  name would make it try to re-apply (the `IF NOT EXISTS` keeps even that a
  no-op, but matching avoids a spurious "pending migration").
- **Regenerate types against the linked ref `kpplmltwctkfwrdtllez`, not the
  local stub.** Either the Supabase MCP `generate_typescript_types` tool or
  `supabase gen types typescript --project-id kpplmltwctkfwrdtllez` — overwrite
  the whole `database.generated.ts` (it is fully generated; do not hand-edit a
  single field).

## Phase 1: Drift reconciliation & verification

### Overview

Add the missing migration file, regenerate types, sweep for sibling drift, and
verify through both typecheck and Stryker.

### Changes Required:

#### 1. Committed migration file

**File**: `supabase/migrations/20260626135427_add_result_storage_path.sql` (new)

**Intent**: Capture in-repo the column that was applied to prod out-of-band, so
fresh clones / local Supabase / CI all get it. Idempotent so it is a no-op
against prod.

**Contract**: Single statement —
`ALTER TABLE transformations ADD COLUMN IF NOT EXISTS result_storage_path TEXT;`
Column is nullable (no default, no backfill) to match the live DDL exactly.

#### 2. Regenerated database types

**File**: `src/types/database.generated.ts` (regenerate, overwrite)

**Intent**: Bring the generated types in sync with the live schema so the two
typecheck errors clear.

**Contract**: After regen, the `transformations` table's `Row` gains
`result_storage_path: string | null`, with the corresponding `Insert`/`Update`
optional entries. File is wholly machine-generated against project
`kpplmltwctkfwrdtllez` — no manual edits.

#### 3. Full-schema drift sweep (read-only verification)

**Intent**: Confirm `result_storage_path` is the *only* drift, since the
out-of-band migration proves the process has slipped at least once. Surface any
other orphaned columns/tables for separate follow-up; do not fix them here.

**Contract**: Compare live schema (`information_schema.columns` /
`supabase_migrations.schema_migrations` on `kpplmltwctkfwrdtllez`, via Supabase
MCP `execute_sql` or `list_migrations`) against `supabase/migrations/`. Expected
result: exactly one remote-only migration (`20260626135427`), now reconciled.
Any additional discrepancy is recorded in the change notes, not actioned.

### Success Criteria:

#### Automated Verification:

- [ ] Migration file exists: `ls supabase/migrations/20260626135427_add_result_storage_path.sql`
- [ ] Generated types include the column: `result_storage_path` present in `src/types/database.generated.ts`
- [ ] Typecheck passes: `npm run typecheck` (astro check + tsc --noEmit), both TS2322/TS2339 cleared
- [ ] Stryker dry-run compiles: `npx stryker run` gets past the TypeScript-checker dry-run without the prior compilation failure

#### Manual Verification:

- [ ] Drift sweep confirms `result_storage_path` is the only remote-only migration / column drift (or any extras are noted in change.md for follow-up)
- [ ] No application code changed (git diff touches only the migration file and `database.generated.ts`)

**Implementation Note**: After automated verification passes, pause for manual
confirmation that the drift sweep came back clean before closing the change.

---

## Testing Strategy

### Unit Tests:

- None required — no application logic changes. The "test" is the compiler:
  typecheck must pass and Stryker's checker must compile.

### Integration Tests:

- None. The runtime path (`update` → `result-url`) already works in prod and is
  unchanged.

### Manual Testing Steps:

1. Run `npm run typecheck` — confirm zero errors at
   `transformation-processor.ts:110` and `result-url.ts:31`.
2. Run `npx stryker run` — confirm it proceeds past the dry-run compilation
   (the original blocker) rather than failing the TS check.
3. Review `git diff --stat` — confirm only two files changed (migration +
   generated types).

## Performance Considerations

None — DDL is already applied in prod; the repo file is a no-op there.

## Migration Notes

- `ADD COLUMN IF NOT EXISTS` is a no-op against prod (column present) and creates
  the column on any environment that lacks it (fresh clone, local Supabase in
  Phase 3 of the test-harness rollout, CI).
- Nullable with no backfill matches the live column; existing rows already have
  values where transformations reached `full_ready`.

## References

- Frame brief: `context/changes/result-storage-path-missing-column/frame.md`
- Source files: `src/lib/transformation-processor.ts:84,105-116`,
  `src/pages/api/transformations/[jobId]/result-url.ts:22,31`
- Live schema: project `kpplmltwctkfwrdtllez`, table `public.transformations`
- Orphaned migration: remote `20260626135427_add_result_storage_path`
- Related lesson: `context/foundation/lessons.md` — "Reconstruct storage paths
  from trusted values" (considered, ruled out)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Drift reconciliation & verification

#### Automated

- [x] 1.1 Migration file exists: `supabase/migrations/20260626135427_add_result_storage_path.sql`
- [x] 1.2 Generated types include `result_storage_path` in `src/types/database.generated.ts`
- [x] 1.3 Typecheck passes (`npm run typecheck`), TS2322/TS2339 cleared
- [x] 1.4 Stryker dry-run compiles (`npx stryker run` past the TS-checker dry-run)

#### Manual

- [x] 1.5 Drift sweep confirms this is the only drift (or extras noted in change.md)
- [x] 1.6 git diff touches only the migration file and `database.generated.ts`
