---
change_id: result-storage-path-missing-column
title: Fix broken full-res download — result_storage_path column missing from transformations
status: implemented
created: 2026-06-29
updated: 2026-06-29
archived_at: null
---

## Notes

Surfaced while fixing the typecheck baseline in the `testing-harness-auth-access-security` Phase 1 work.

`result_storage_path` is written in `src/lib/transformation-processor.ts:110` (on the `full_ready` status update) and read in `src/pages/api/transformations/[jobId]/result-url.ts:31` (to mint a signed download URL), but the column exists in **no migration** and is absent from `src/types/database.generated.ts`.

Runtime impact: the `update` that sets `result_storage_path` silently fails (no error check on that Supabase call), and the result-url endpoint's `select` hits a PostgREST "column does not exist" error → `data` is null → returns 404. The full-resolution download feature is effectively broken in production.

Two typecheck errors trace to this and currently block a full `npx stryker run` (the TS checker's dry-run compilation fails):
- `transformation-processor.ts:110` — TS2322 Type 'string' is not assignable to type 'never'
- `result-url.ts:31` — TS2339 Property 'result_storage_path' does not exist

Framing question for /10x-frame: should `result_storage_path` be a stored column at all, or should the path be reconstructed from trusted values per the `lessons.md` rule "Reconstruct storage paths from trusted values, not public URLs"? Fixing as a stored column needs: migration + `npm run` type regen + Supabase deploy (and the `npm run build && npm run deploy` gotcha for server-side changes).

## Drift sweep result (Phase 1, 2026-06-29)

`list_migrations` on `kpplmltwctkfwrdtllez` returned exactly one remote-only migration — `20260626135427 add_result_storage_path` — with no matching repo file. Now reconciled by the committed migration. No other orphaned migrations surfaced; `result_storage_path` was the only drift. Type regen done via a surgical 3-line insert (Row/Insert/Update) matching the live schema rather than a wholesale overwrite — the CLI needs interactive login and the MCP `generate_typescript_types` output structurally diverges from the committed file (drops `graphql_public`). Net effect on the `public` schema is identical to a regen. Stryker full run confirmed green (dry-run compiled, 11m mutation run completed) — the original TS-checker blocker is cleared.
