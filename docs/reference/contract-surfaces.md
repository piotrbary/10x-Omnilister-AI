# Contract Surfaces

Load-bearing names, path conventions, and cross-layer contracts that must remain consistent across the codebase. Violations cause silent 403s, quota bypass, or broken foreign keys — not compile errors.

---

## Storage path convention

**Buckets**: `original-photos`, `transformed-photos`

**Required path format**: `{user_id}/{object_id}/{filename}`

- `user_id` — UUID matching `auth.uid()` of the uploading user
- `object_id` — UUID of the parent `objects` row
- `filename` — arbitrary filename with a MIME-appropriate extension

**Why this matters**: Storage RLS policies enforce owner isolation via `(storage.foldername(name))[1] = auth.uid()::text`. `foldername` splits on `/` and returns segment `[1]` (the first path component). If the path omits the `user_id` as the first segment, the policy returns `NULL` and the upload is silently blocked with 403.

**Enforced by**: `supabase/migrations/20260530000000_initial_schema.sql` — policies `"original-photos owner"` and `"transformed-photos owner"`.

**Upload helper contract**: Any function that uploads to either bucket MUST construct the path as `${userId}/${objectId}/${filename}`. Validate the user_id prefix before calling `supabase.storage.from(bucket).upload(path, file)`.

---

## profiles.storage_used_bytes accounting

- Incremented automatically by trigger `on_photo_storage_change` (AFTER INSERT on `photos`)
- Incremented by trigger `on_transformation_storage_change` when `transformations.status` transitions to `'saved'`
- Decremented by same triggers on DELETE or status reversal
- Upper bound: `CHECK (storage_used_bytes <= 104857600)` — 100 MiB, matches `storageConfig.Max_Client_Repository` in `src/lib/config.ts`
- Lower bound: `CHECK (storage_used_bytes >= 0)` — added in migration `20260530000001`

**Changing `Max_Client_Repository` in config.ts requires a new Supabase migration** to update the `storage_limit` CHECK constraint. There is no build-time assertion that catches divergence.

---

## transformations.result_file_size_bytes

Must be non-null when `status = 'saved'` (enforced by `CONSTRAINT result_size_required_when_saved` in migration `20260530000002`). The storage accounting trigger uses this value; a NULL would silently contribute 0 bytes and bypass the quota cap.
