# DB Schema and Storage — Plan Brief

> Full plan: `context/changes/db-schema-storage/plan.md`

## What & Why

F-01 creates the complete data foundation that every Omnilister AI product slice depends on. Without it, S-01 through S-04 have no tables to read or write. The six tables, two Storage buckets, RLS policies, and 9 seeded preset styles are the minimum viable data layer for the MVP critical path.

## Starting Point

The Supabase CLI (v2.23.4) is installed and `supabase/config.toml` is present, but `schema_paths = []` — no migrations exist. `auth.users` is the only populated entity (from the existing auth flow). Everything else starts from scratch.

## Desired End State

A single migration file (`supabase/migrations/20260530000000_initial_schema.sql`) applies cleanly on `supabase db reset`. Six tables exist with RLS enabled, triggers maintaining storage usage counters, and CHECK constraints bounding the 100 MB per-account limit. Two private Storage buckets with owner-only path policies are ready for photo uploads. Nine system preset styles are seeded and globally readable. TypeScript types are generated and committed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| User profile extension | Separate `profiles` table (FK → auth.users) | Clean separation from Supabase Auth internals; easy to add app-level columns without touching auth schema |
| Storage usage tracking | `storage_used_bytes` column on `profiles` + triggers | O(1) reads for limit checks; enforced even under concurrent uploads |
| Bucket creation | SQL migration (`storage.buckets` INSERT) | Version-controlled and reproducible on both local and production with one `supabase db push` |
| `styles` table | Full schema + 9 MVP preset seeds (in migration) | S-03 reads from DB immediately; S-04 just adds UI on top |
| `quality_scores` history | Full history (one row per scoring run) | Score-over-time comparison remains available across sessions |
| `photos` columns | `thumbnail_url` + `file_size_bytes` both stored | `file_size_bytes` feeds the storage trigger; `thumbnail_url` avoids re-generating signed URLs |
| Styles RLS | `is_public = true OR user_id = auth.uid()` for SELECT | System presets globally readable; INSERT policy blocks users from creating NULL-user_id rows |
| Indexes | Targeted hot-path only (7 indexes) | Covers all MVP query patterns without over-indexing writes |
| Migration structure | Single file | One `supabase db reset` applies everything; simpler to reason about on greenfield |
| Trigger scope | Both photos and saved transformations | 100 MB limit covers all stored files (original + transformed) per PRD NFR |
| Limit enforcement | DB CHECK constraint + application primary check | DB constraint is the last-resort guard against race conditions |
| Seeds location | Inside migration file (not seed.sql) | Seeds re-apply automatically on every `supabase db reset` — no separate step |

## Scope

**In scope:**
- `profiles`, `objects`, `photos`, `quality_scores`, `transformations`, `styles` tables
- RLS on all 6 tables
- `update_updated_at` trigger (shared), `create_profile_for_user` trigger, two storage-usage triggers
- `profiles.storage_used_bytes` CHECK constraint (≤ 100 MB)
- Hot-path indexes (7)
- `original-photos` and `transformed-photos` Storage buckets + RLS
- 9 system preset styles seeded
- TypeScript type generation → `src/types/database.generated.ts`

**Out of scope:**
- API routes, TypeScript business logic types, React components (belong to S-01/S-02/S-03)
- Production Supabase project setup, secrets management
- Supabase Edge Functions or Realtime
- `supabase/seed.sql` — not used

## Architecture / Approach

Everything lives in one SQL migration file, written in dependency order: functions → tables → triggers → RLS → indexes → buckets → seeds. The trigger chain: user signs up → `profiles` row auto-created → user uploads photo → `photos` INSERT trigger increments `profiles.storage_used_bytes` → user saves transformation → `transformations` UPDATE trigger increments it further. All triggers use `SECURITY DEFINER` to bypass the invoking user's RLS context when modifying `profiles`.

**S-03 contract note:** The `transformations` table adds one column not in S-03's original spec: `result_file_size_bytes BIGINT`. S-03's POST `/save` route must populate this column.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Core Schema | 6 tables + 4 functions + triggers + CHECK constraint | Trigger `SECURITY DEFINER` omitted → storage counter silently fails |
| 2. RLS Policies | Owner-only access on 5 tables; public-read on styles | Missing `WITH CHECK` on styles INSERT → users could insert system presets via API |
| 3. Indexes, Buckets & Seeds | 7 indexes + 2 buckets + 9 presets + TS types | Storage bucket path convention mismatch with S-01/S-03 upload paths |

**Prerequisites:** Supabase CLI installed (`supabase --version`), local Supabase running (`supabase start`), no existing migrations.

**Estimated effort:** ~1–2 focused sessions across 3 phases. Phase 1 is the heaviest (~60% of the SQL). Phases 2 and 3 are shorter appends.

## Open Risks & Assumptions

- `profiles.storage_used_bytes` CHECK constraint value (104,857,600) is hardcoded in SQL; if `storageConfig.Max_Client_Repository` in `src/lib/config.ts` ever changes, a new migration must update the constraint
- System preset prompts in seeds must exactly match `PRESET_STYLES` in S-03's `src/lib/transformation-styles.ts` — divergence would cause DB ↔ code mismatch
- `supabase link --project-ref <ref>` must be run before `supabase db push` to target the production project; this is an operational step outside the plan

## Success Criteria (Summary)

- `supabase db reset` applies the full migration cleanly with no errors — all tables, triggers, and policies present
- A new user sign-up automatically creates a `profiles` row; uploading and deleting a photo updates `storage_used_bytes` in real time
- All 9 preset styles appear in `SELECT * FROM styles` for any authenticated user
