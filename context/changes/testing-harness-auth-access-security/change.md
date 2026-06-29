---
change_id: testing-harness-auth-access-security
title: Testing harness auth access security
status: implementing
created: 2026-06-28
updated: 2026-06-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 1 decisions (2026-06-28)

- **`getViteConfig` + Cloudflare adapter**: loading `astro.config.mjs` via
  `getViteConfig` pulls in the Cloudflare adapter, whose Vite plugin rejects the
  test environment (`resolve.external` incompatibility). Worked around by passing
  `configFile: false` and mirroring the `astro:env` schema inline in
  `vitest.config.ts` (keep in sync with `astro.config.mjs`).
- **Stryker scoping**: `vitest: { dir: "src" }` was wrong — `--dir src` + the
  root-relative `include` globs discovers *zero* tests. Switched to a dedicated
  `vitest.config.unit.ts` referenced via `vitest: { configFile }`.
- **Baseline typecheck fixed (A & B)**: excluded non-app dirs
  (`agent-sdk-examples`, `packages`, `.stryker-tmp`) from `tsconfig.json`; widened
  `scorePhoto`/`_callGptVision` `model` param to `string` (was inferred literal
  `"openai/gpt-4o"`, rejecting `aiConfig.previewModel`).
- **FOLLOW-UP — own change needed (bucket C)**: `result_storage_path` is written
  in `src/lib/transformation-processor.ts:110` and read in
  `src/pages/api/transformations/[jobId]/result-url.ts:31`, but the column exists
  in **no migration** and not in `src/types/database.generated.ts`. At runtime the
  `update` silently fails (no error check) and the result-url endpoint 404s — the
  full-res-download feature is broken in prod. Needs a migration + type regen +
  Supabase deploy, and a risk review. Stryker's full run stays blocked on these 2
  TS-checker errors until then.
