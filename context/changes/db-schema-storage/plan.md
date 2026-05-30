# DB Schema and Storage — Implementation Plan

## Overview

Creates the complete database foundation for Omnilister AI: six tables (`profiles`, `objects`, `photos`, `quality_scores`, `transformations`, `styles`), RLS policies, hot-path indexes, two Supabase Storage buckets with owner-only access policies, and 9 seeded MVP preset styles. Everything lands in a single migration file. Once applied locally (`supabase db reset`) and remotely (`supabase db push`), every downstream slice (S-01 through S-04) has the data layer it needs.

## Current State Analysis

As of 2026-05-30:
- Supabase CLI v2.23.4 installed as dev dep; `supabase/config.toml` present with local DB on port 54322
- `schema_paths = []` — no migrations exist; `supabase db reset` starts from scratch
- Auth is configured (email signup enabled, JWT 1h expiry) — `auth.users` is the identity anchor
- `supabase/seed.sql` referenced in config.toml; not used for styles seed (seeds go in migration)
- `src/lib/config.ts` defines `storageConfig.Max_Client_Repository = 100 * 1024 * 1024 = 104,857,600` bytes (100 MiB) — the DB CHECK constraint must match this constant
- S-03 plan at `context/changes/ai-transformation-session/plan.md` defines the `transformations` table contract; this plan is authoritative and F-01 must match it, with one addition: `result_file_size_bytes BIGINT` (needed by the storage-usage trigger)

## Desired End State

After `supabase db reset` (local) and `supabase db push` (production):
- Six tables exist in the `public` schema with correct columns, types, foreign keys, and constraints
- RLS is enabled on all six tables; owner-only access enforced; `styles` additionally allows public-read for rows where `is_public = true`
- All trigger functions are installed; inserting a `photos` row increments `profiles.storage_used_bytes`; saving a transformation increments it; deleting either decrements it
- `profiles.storage_used_bytes` is bounded by a CHECK constraint (≤ 104,857,600 bytes)
- Two private buckets (`original-photos`, `transformed-photos`) exist; owner-only Storage RLS policies are active
- 9 system preset styles are seeded (user_id = NULL, is_public = true) matching S-03's `PRESET_STYLES` config
- `supabase gen types typescript --local` produces valid TypeScript output

### Key Discoveries

- `storage.foldername(name)[1]` returns the first path segment of a Storage object — used in bucket RLS policies to enforce `{user_id}/...` path convention
- `SECURITY DEFINER` on trigger functions is required when the trigger modifies `profiles` (owned by the same user whose row is being mutated) to avoid RLS recursion
- The `profiles` table trigger (`create_profile_for_user`) fires on `auth.users` INSERT — this is in the `auth` schema, so the trigger must be created with sufficient privileges; Supabase migrations run as the `postgres` superuser, so this is safe
- `quality_scores` is an immutable append-only table (full history); it has no `updated_at` column and no `update_updated_at` trigger
- `styles` system presets have `user_id = NULL`; the INSERT RLS policy requires `user_id = auth.uid()`, which prevents any API call from inserting a NULL user_id row — only migrations can create system presets

## What We're NOT Doing

- Not creating API routes or TypeScript types beyond generated DB types (those belong to S-01/S-02/S-03)
- Not implementing storage usage validation in application code (that's S-01/S-03's responsibility)
- Not configuring Supabase Edge Functions or Realtime
- Not setting up production Supabase project or managing production secrets
- Not creating `supabase/seed.sql` data — seeds live in the migration file
- Not modifying `wrangler.jsonc` or any Cloudflare Workers config

## Implementation Approach

All SQL goes into a single migration file created with `supabase migration new initial_schema`. The file is written in three logical sections (matching the three plan phases), then tested with `supabase db reset`. Object creation order within the file follows dependency constraints: functions before triggers, `profiles` before tables that reference `auth.users`, `objects` before `photos`, `photos` before `quality_scores` and `transformations`.

## Critical Implementation Details

**Trigger SECURITY DEFINER is load-bearing.** The storage-usage triggers (`update_storage_on_photo_change`, `update_storage_on_transformation_status`) run in the security context of the invoking user by default. When a user inserts a photo, that user's RLS context is active — and updating `profiles` for a different user would fail. `SECURITY DEFINER` runs the function as the function owner (`postgres`), bypassing RLS for the `profiles` UPDATE. Without it, the trigger silently fails or raises an RLS violation.

**`profiles` FK is `ON DELETE CASCADE`.** When a user account is deleted from `auth.users`, their `profiles` row cascades. All other tables also cascade from `auth.users` directly — no orphaned rows if an account is deleted.

**`result_file_size_bytes` column added to `transformations`.** The S-03 plan's contract did not include this column. F-01 adds it. S-03's POST `/transformations/[jobId]/save` route must populate it when saving a result to Storage.

---

## Phase 1: Core Schema — Tables, Functions & Triggers

### Overview

Creates the migration file and writes all table DDL, helper functions, and triggers into it. No RLS, no indexes, no buckets yet — just the raw schema objects. Verifiable with `supabase db reset` and a psql check.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: The single migration file for F-01. Created via `supabase migration new initial_schema` (which generates a timestamped filename); rename or accept the auto-generated timestamp. All subsequent changes in Phases 1–3 append to this file.

**Contract**: File must end up applying cleanly from a fresh Supabase state (`supabase db reset`). All objects defined below must land in this file in the order listed (functions → tables → triggers → RLS → indexes → buckets → seeds).

#### 2. `update_updated_at` trigger function

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: A shared PL/pgSQL function that sets `NEW.updated_at = NOW()` and returns `NEW`. Used by BEFORE UPDATE triggers on all tables that have an `updated_at` column.

**Contract**:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
```

#### 3. `profiles` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Stores per-user application state: `storage_used_bytes` (for the 100 MB limit) and `ai_consent_confirmed_at` (for the GDPR faza-2 requirement, nullable for MVP). One row per `auth.users` row.

**Contract**: Columns: `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `storage_used_bytes BIGINT NOT NULL DEFAULT 0`, `ai_consent_confirmed_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Constraint: `CHECK (storage_used_bytes <= 104857600)` — matches `storageConfig.Max_Client_Repository`. BEFORE UPDATE trigger on `profiles` calls `update_updated_at()`.

#### 4. `create_profile_for_user` function + trigger

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Automatically inserts a `profiles` row when a new user registers, so the application never needs to create profiles manually.

**Contract**:
```sql
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_user();
```

`SECURITY DEFINER` with explicit `search_path = public` is required — the trigger runs in `auth` schema context, and the explicit search_path prevents schema injection.

#### 5. `objects` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Represents a seller's listed item (car, property, everyday object). `category` is NULL at creation and filled by S-02 after AI analysis.

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `version TEXT NOT NULL DEFAULT '1'`, `category TEXT CHECK (category IN ('car', 'real-estate', 'item'))`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. BEFORE UPDATE trigger calls `update_updated_at()`.

#### 6. `photos` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Stores metadata for every original photo uploaded to `original-photos` Storage bucket. `file_size_bytes` drives the storage usage trigger; `thumbnail_url` avoids re-generating signed URLs for gallery renders.

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE`, `original_url TEXT NOT NULL`, `thumbnail_url TEXT`, `file_size_bytes BIGINT NOT NULL`, `mime_type TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. BEFORE UPDATE trigger calls `update_updated_at()`.

#### 7. `quality_scores` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Append-only history of every quality scoring run per photo. Full history retained so before/after score comparisons across sessions remain valid. No `updated_at` column — rows are immutable after insert.

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE`, `category TEXT NOT NULL CHECK (category IN ('car', 'real-estate', 'item'))`, `sharpness NUMERIC(4,2) NOT NULL`, `lighting NUMERIC(4,2) NOT NULL`, `background NUMERIC(4,2) NOT NULL`, `object_features NUMERIC(4,2) NOT NULL`, `damage_defects NUMERIC(4,2) NOT NULL`, `labels NUMERIC(4,2) NOT NULL`, `angle_coverage NUMERIC(4,2) NOT NULL`, `sales_readiness NUMERIC(4,2) NOT NULL`, `overall_score NUMERIC(4,2) NOT NULL`, `is_sales_ready BOOLEAN NOT NULL`, `scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. No update trigger (immutable rows).

#### 8. `transformations` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Tracks the lifecycle of each AI transformation job (one row per photo per session). Matches the contract in `context/changes/ai-transformation-session/plan.md` plus one addition: `result_file_size_bytes` (needed by the storage-usage trigger).

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE`, `photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE`, `style_name TEXT NOT NULL`, `prompt TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','draft_ready','full_ready','failed','saved'))`, `draft_url TEXT`, `result_url TEXT`, `result_file_size_bytes BIGINT`, `score_before JSONB`, `score_after JSONB`, `feedback TEXT CHECK (feedback IN ('improved','not_improved'))`, `error_message TEXT`, `retry_count INTEGER NOT NULL DEFAULT 0`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. BEFORE UPDATE trigger calls `update_updated_at()`.

#### 9. `styles` table

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Global library of transformation styles. System presets have `user_id = NULL` and `is_public = TRUE`. User-created styles have `user_id = <uid>` and default `is_public = FALSE`. S-04 will add UI on top of this table.

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `category TEXT NOT NULL CHECK (category IN ('car', 'real-estate', 'item'))`, `prompt TEXT NOT NULL`, `description TEXT`, `is_public BOOLEAN NOT NULL DEFAULT FALSE`, `usage_count INTEGER NOT NULL DEFAULT 0`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. BEFORE UPDATE trigger calls `update_updated_at()`. Note: `user_id` is nullable (system presets); the FK has `ON DELETE CASCADE` for user-created styles.

#### 10. Storage-usage trigger — photos

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Keeps `profiles.storage_used_bytes` accurate as photos are inserted or deleted. `SECURITY DEFINER` allows the function to UPDATE `profiles` regardless of the invoking user's RLS context.

**Contract**:
```sql
CREATE OR REPLACE FUNCTION update_storage_on_photo_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET storage_used_bytes = storage_used_bytes + NEW.file_size_bytes
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET storage_used_bytes = storage_used_bytes - OLD.file_size_bytes
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_photo_storage_change
  AFTER INSERT OR DELETE ON photos
  FOR EACH ROW EXECUTE FUNCTION update_storage_on_photo_change();
```

#### 11. Storage-usage trigger — transformations

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Increments `profiles.storage_used_bytes` when a transformation is saved (status → 'saved'), decrements when un-saved or deleted. Fires on both UPDATE and DELETE.

**Contract**:
```sql
CREATE OR REPLACE FUNCTION update_storage_on_transformation_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'saved' AND OLD.status != 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes + COALESCE(NEW.result_file_size_bytes, 0)
      WHERE id = NEW.user_id;
    ELSIF OLD.status = 'saved' AND NEW.status != 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes - COALESCE(OLD.result_file_size_bytes, 0)
      WHERE id = OLD.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes - COALESCE(OLD.result_file_size_bytes, 0)
      WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_transformation_storage_change
  AFTER UPDATE OR DELETE ON transformations
  FOR EACH ROW EXECUTE FUNCTION update_storage_on_transformation_status();
```

### Success Criteria

#### Automated Verification

- `supabase db reset` completes without SQL errors
- All 6 tables present: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;` returns `objects, photos, profiles, quality_scores, styles, transformations`
- All 4 functions present: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' ORDER BY routine_name;` returns `create_profile_for_user, update_storage_on_photo_change, update_storage_on_transformation_status, update_updated_at`
- CHECK constraint enforced: `INSERT INTO profiles (id, storage_used_bytes) VALUES (gen_random_uuid(), 104857601)` raises a constraint violation
- Profile auto-create trigger exists on auth.users: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created' AND event_object_schema = 'auth';` returns 1 row

#### Manual Verification

- `psql -h localhost -p 54322 -U postgres -d postgres -c "\d profiles"` shows all expected columns with correct types and constraints
- Insert a test `photos` row, verify `profiles.storage_used_bytes` increments by `file_size_bytes`; delete the row, verify it decrements
- Insert a `transformations` row, update status to `'saved'` with `result_file_size_bytes = 1000`, verify `profiles.storage_used_bytes` increases by 1000
- Sign up a new test user via the auth flow; confirm a `profiles` row is auto-created with `storage_used_bytes = 0`

**Implementation Note**: Run `supabase db reset` after writing Phase 1 SQL to validate the core schema before proceeding. Fix any errors before moving to Phase 2.

---

## Phase 2: RLS Policies

### Overview

Appends Row Level Security configuration to the migration file. All six tables get RLS enabled; five get owner-only policies; `styles` gets the split public-read / owner-write policy. Verifiable by checking `pg_policies` and testing access isolation via psql.

### Changes Required

#### 1. RLS for `profiles`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Owner read-only access. Users can SELECT their own profile row (needed by S-03's save route to read `storage_used_bytes`). No UPDATE/INSERT/DELETE for the authenticated role — all writes to `profiles` are owned exclusively by SECURITY DEFINER triggers (`create_profile_for_user`, `update_storage_on_photo_change`, `update_storage_on_transformation_status`) and the service_role key. This prevents authenticated users from resetting `storage_used_bytes = 0` via the Supabase REST API.

**Contract**: `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;` + one `FOR SELECT` policy: `USING (id = auth.uid())`. No write policies for the authenticated role.

#### 2. RLS for `objects`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Owner-only access.

**Contract**: `ALTER TABLE objects ENABLE ROW LEVEL SECURITY;` + one `FOR ALL` policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.

#### 3. RLS for `photos`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Owner-only access.

**Contract**: `ALTER TABLE photos ENABLE ROW LEVEL SECURITY;` + one `FOR ALL` policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.

#### 4. RLS for `quality_scores`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Owner-only access; scores for one user's photos are not visible to others.

**Contract**: `ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;` + one `FOR ALL` policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.

#### 5. RLS for `transformations`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Owner-only access.

**Contract**: `ALTER TABLE transformations ENABLE ROW LEVEL SECURITY;` + one `FOR ALL` policy: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.

#### 6. RLS for `styles`

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Public styles (including system presets) are readable by any authenticated user. Writes are always owner-only. The INSERT policy requires `user_id = auth.uid()`, which is never NULL — preventing API callers from inserting system presets.

**Contract**:
```sql
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "styles select"  ON styles FOR SELECT
  USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "styles insert"  ON styles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "styles update"  ON styles FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "styles delete"  ON styles FOR DELETE
  USING (user_id = auth.uid());
```

### Success Criteria

#### Automated Verification

- `supabase db reset` completes cleanly with RLS section appended
- RLS enabled on all 6 tables: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;` — all rows show `rowsecurity = true`
- Policy count: `SELECT tablename, count(*) FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename ORDER BY tablename;` — profiles/objects/photos/quality_scores/transformations each show 1 policy; styles shows 4 policies

#### Manual Verification

- Using psql as the `anon` role (no JWT), `SELECT * FROM objects;` returns 0 rows (RLS blocks, not an error — Supabase returns empty for denied reads, not 403)
- Create two test users A and B (via auth signup); as user A, insert an object; as user B, `SELECT * FROM objects` returns 0 rows
- As user A, `SELECT * FROM styles` returns 9 rows (the seeded presets from Phase 3) after seeds are applied

**Implementation Note**: RLS verification requires at least Phase 3 seeds to be in place for the `styles` test. Run the full manual check after Phase 3 completes.

---

## Phase 3: Indexes, Storage Buckets & Seeds

### Overview

Appends the performance indexes, Storage bucket creation, Storage RLS policies, and 9 style preset INSERTs to the migration file. Then runs the complete `supabase db reset` verification and generates TypeScript types.

### Changes Required

#### 1. Hot-path performance indexes

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Create indexes on the columns that every product slice will filter or join on. Without these, gallery loads, score lookups, and transformation status polls degrade to sequential scans.

**Contract**: Create the following indexes:
- `CREATE INDEX idx_objects_user ON objects(user_id, created_at DESC);`
- `CREATE INDEX idx_photos_object ON photos(object_id);`
- `CREATE INDEX idx_photos_user ON photos(user_id);`
- `CREATE INDEX idx_quality_scores_photo_scored ON quality_scores(photo_id, scored_at DESC);`
- `CREATE INDEX idx_transformations_object_status ON transformations(object_id, status);`
- `CREATE INDEX idx_transformations_user_created ON transformations(user_id, created_at DESC);`
- `CREATE INDEX idx_styles_category_public ON styles(category, is_public);`

#### 2. Storage buckets

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Creates the two private Storage buckets that hold original and transformed photos. `file_size_limit = 10485760` (10 MB) matches `storageConfig.maxSinglePhotoBytes`. Allowed MIME types match `storageConfig.allowedPhotoMimeTypes`.

**Contract**:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('original-photos',    'original-photos',    false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('transformed-photos', 'transformed-photos', false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
```

#### 3. Storage bucket RLS policies

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Enforces that each user can only access Storage objects whose path starts with their own `user_id`. Path convention: `{user_id}/{object_id}/...`

**Contract**: Apply owner-only policies to `storage.objects` for each bucket. The key function is `storage.foldername(name)[1]` which returns the first path segment:
```sql
CREATE POLICY "original-photos owner" ON storage.objects
  FOR ALL USING (
    bucket_id = 'original-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'original-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "transformed-photos owner" ON storage.objects
  FOR ALL USING (
    bucket_id = 'transformed-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'transformed-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

#### 4. Preset styles seed

**File**: `supabase/migrations/20260530000000_initial_schema.sql`

**Intent**: Seeds the 9 system preset styles that S-03's style picker will display. These must match the `PRESET_STYLES` configuration in `src/lib/transformation-styles.ts` (written by S-03 Phase 1). `user_id = NULL` makes them system-owned; `is_public = true` makes them globally visible. The no-distortion guardrail is embedded in each prompt.

**Contract**: 9 `INSERT INTO styles (user_id, name, category, prompt, description, is_public)` rows:

Car presets:
- `('showroom', 'car', 'Professional car dealership setting. Clean showroom floor, neutral background, even studio lighting. Do not add, remove, or alter any features of the car. Preserve all details, color, and markings exactly as shown.', 'Dealership showroom look', true)`
- `('outdoor-clean', 'car', 'Clean outdoor setting on a clear day. Neutral road or empty parking lot background. Natural daylight. Do not modify the car's appearance, color, or features.', 'Outdoor natural light', true)`
- `('white-studio', 'car', 'Pure white seamless studio background. Professional photography lighting setup. No reflections on background. Do not alter any car features, color, or specifications.', 'White studio background', true)`

Real-estate presets:
- `('bright-interior', 'real-estate', 'Maximize natural light and brightness. Clean, uncluttered look. Sky through windows should be clear and bright. Do not add furniture or objects not present in the original.', 'Bright natural light interior', true)`
- `('twilight-exterior', 'real-estate', 'Warm golden-hour lighting. Well-lit façade. Clear sky. Do not add landscaping or features not present in the original.', 'Twilight golden hour exterior', true)`
- `('clean-professional', 'real-estate', 'Professional real estate photography look. Balanced exposure, crisp details. Do not add, remove, or alter any architectural features.', 'Clean professional look', true)`

Item presets:
- `('white-background', 'item', 'Pure white seamless background. Clean product photography with even lighting from multiple angles. Do not add any props or elements not present in the original.', 'White product background', true)`
- `('neutral-background', 'item', 'Soft gray or beige neutral background. Professional product photography. Even lighting, no harsh shadows. Do not add any items not in the original.', 'Neutral gray background', true)`
- `('lifestyle-context', 'item', 'Natural lifestyle photography context appropriate for the item. Keep the item as the focal point. Do not add any elements that misrepresent the product's condition or features.', 'Lifestyle context', true)`

#### 5. TypeScript type generation

**File**: `src/types/database.generated.ts` (new, generated)

**Intent**: Generate Supabase TypeScript types from the local schema so all downstream slices get type-safe DB access without manual type maintenance.

**Contract**: Run `npx supabase gen types typescript --local > src/types/database.generated.ts`. The output file is generated — do not manually edit it. It provides `Database`, `Tables`, `Enums` types consumed by the Supabase client. Commit the generated file so CI has it without requiring a local Supabase instance.

### Success Criteria

#### Automated Verification

- `supabase db reset` applies the complete migration (all 3 phases' SQL) without errors
- All 7 indexes exist: `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;` returns 7 rows matching the names above
- Both buckets exist: `SELECT name FROM storage.buckets ORDER BY name;` returns `original-photos, transformed-photos`
- 9 style presets seeded: `SELECT COUNT(*) FROM styles WHERE user_id IS NULL AND is_public = true;` returns 9
- TypeScript types generated: `src/types/database.generated.ts` exists and `npm run typecheck` passes

#### Manual Verification

- Supabase Studio (http://localhost:54323): open Storage → verify both buckets appear as private
- Upload a test file to `original-photos` under path `{your-user-id}/test/photo.jpg` via Studio — succeeds; attempt the same under a different user's ID path — Storage RLS blocks it (returns 403)
- `SELECT name, category, is_public FROM styles ORDER BY category, name;` returns all 9 presets with correct categories
- Verify preset prompts contain the no-distortion guardrail phrase "Do not add" or equivalent in each row
- Open `src/types/database.generated.ts` and verify it contains `Tables<'profiles'>`, `Tables<'transformations'>` with the expected shape

**Implementation Note**: This is the final phase. After all automated and manual checks pass, the foundation is ready for S-01, S-02, and S-03. To apply to the production Supabase project: first link it with `npx supabase link --project-ref <ref>`, then run `npx supabase db push`.

---

## Testing Strategy

### Automated Tests

- `supabase db reset` is the primary migration test — it applies the full migration from scratch and fails if any SQL is invalid
- Post-reset SQL queries (see each phase's automated criteria) verify object existence and counts
- `npm run typecheck` after type generation catches any TS shape mismatches

### Integration Tests

- After S-01 is implemented: insert objects + photos via the API, verify `profiles.storage_used_bytes` updates
- After S-03 is implemented: save a transformation, verify storage counter increments; delete it, verify it decrements
- After S-02 is implemented: insert 2 quality_score rows for the same photo, verify both persist (not upserted)

### Manual Testing Steps

1. `supabase start` and `supabase db reset` — confirm clean apply
2. Create two users via the auth sign-in flow; confirm both have a `profiles` row auto-created
3. As user A, insert an object and photos; as user B, confirm they're invisible
4. Check `styles` table as user A — confirm 9 presets visible
5. Upload a photo to `original-photos/{user-A-id}/...` — success; attempt `original-photos/{user-B-id}/...` as user A — blocked

## Performance Considerations

- The `profiles.storage_used_bytes` trigger approach provides O(1) reads for the storage limit check (single column SELECT) at the cost of a trigger on every photo INSERT/DELETE and transformation status change. This is the right trade-off for MVP read-heavy workloads.
- `quality_scores` grows with every scoring run; the `(photo_id, scored_at DESC)` index ensures `ORDER BY scored_at DESC LIMIT 1` queries remain fast even with thousands of historical score rows per photo.
- The `transformations(object_id, status)` composite index supports the most common query pattern: "give me all in-progress jobs for this object."

## Migration Notes

This is a greenfield migration — no existing data to migrate. If the migration needs to be reversed during development, `supabase db reset` drops all objects and re-applies from scratch. For production, a rollback migration would need to be written manually (DROP TABLE for each table in reverse dependency order).

The production `supabase db push` command applies any unapplied migrations. Since this is the first migration, it creates everything fresh on the remote project.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01 section, Unknowns resolved)
- PRD: `context/foundation/prd.md` (NFR: `Max_Client_Repository = 100 MB`, `storageConfig` in `src/lib/config.ts`)
- S-03 contract: `context/changes/ai-transformation-session/plan.md` (Phase 1, Change 3 — `transformations` table spec)
- Config constants: `src/lib/config.ts`
- Supabase local config: `supabase/config.toml`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Core Schema — Tables, Functions & Triggers

#### Automated

- [x] 1.1 `supabase db reset` completes without SQL errors — d032e47
- [x] 1.2 All 6 tables present in `pg_tables` — d032e47
- [x] 1.3 All 4 functions present in `information_schema.routines` — d032e47
- [x] 1.4 CHECK constraint enforced on `profiles.storage_used_bytes` — d032e47
- [x] 1.5 Profile auto-create trigger exists on auth.users (information_schema.triggers query) — d032e47

#### Manual

- [x] 1.6 `\d profiles` shows all expected columns and the CHECK constraint — d032e47
- [x] 1.7 Photo INSERT increments `profiles.storage_used_bytes`; DELETE decrements it — d032e47
- [x] 1.8 Transformation status → 'saved' increments `profiles.storage_used_bytes` — d032e47
- [x] 1.9 Sign-up test user; confirm profiles row auto-created with storage_used_bytes = 0 — d032e47

### Phase 2: RLS Policies

#### Automated

- [x] 2.1 `supabase db reset` completes cleanly with RLS section appended
- [x] 2.2 All 6 tables show `rowsecurity = true` in `pg_tables`
- [x] 2.3 Policy count correct: 1 policy each for 5 owner-only tables; 4 policies for `styles`

#### Manual

- [x] 2.4 Unauthenticated SELECT on `objects` returns 0 rows (not an error)
- [x] 2.5 User A cannot see User B's objects

### Phase 3: Indexes, Storage Buckets & Seeds

#### Automated

- [ ] 3.1 `supabase db reset` applies full migration without errors
- [ ] 3.2 All 7 indexes present in `pg_indexes`
- [ ] 3.3 Both buckets present in `storage.buckets`
- [ ] 3.4 9 style presets seeded with `user_id IS NULL AND is_public = true`
- [ ] 3.5 `src/types/database.generated.ts` exists and `npm run typecheck` passes

#### Manual

- [ ] 3.6 Both buckets appear as private in Supabase Studio
- [ ] 3.7 Storage RLS: upload to own path succeeds; upload to other user's path is blocked
- [ ] 3.8 All 9 style presets have correct categories and no-distortion guardrail in prompt
- [ ] 3.9 Generated types file contains Tables<'profiles'> and Tables<'transformations'> with expected shapes
