# Object Creation and Photo Upload — Implementation Plan

## Overview

Implement S-01: the first product slice where a logged-in user can create a named object, upload up to 10 photos per object directly to Supabase Storage (bypassing the Cloudflare Worker body), and browse a gallery of their uploads. `/dashboard` is replaced by `/objects` as the primary post-login landing page.

## Current State Analysis

F-01 (`db-schema-storage`) is `impl_reviewed`. All required tables, triggers, RLS policies, and Storage buckets are in place:

- `objects` table: `id, user_id, name, version (INTEGER default 1), category (nullable), timestamps`
- `photos` table: `id, user_id, object_id, original_url, thumbnail_url (nullable), file_size_bytes, mime_type, timestamps`
- `profiles` table: `storage_used_bytes` auto-incremented/decremented by DB trigger on `photos` INSERT/DELETE
- `original-photos` bucket: private, 10 MB per file, MIME allow-list, path convention `{user_id}/{object_id}/{file_name}`
- RLS on both tables: owner-only via `user_id = auth.uid()`

No product routes or pages exist yet — only auth API routes (`/api/auth/*`) and auth pages.

### Key Discoveries

- `src/lib/supabase.ts`: factory `createClient(headers, cookies)` returns an SSR-compatible Supabase client using `@supabase/ssr`; returns null if env vars missing — follow this pattern for all new API routes.
- `src/lib/config.ts`: `storageConfig.Max_Client_Repository` (100 MB), `storageConfig.allowedPhotoMimeTypes`, `storageConfig.maxSinglePhotoBytes` (10 MB) already defined.
- `src/types/database.generated.ts`: exists but has `objects.version: string` — needs updating to `number` after migration 006 changed the column type to INTEGER.
- Astro env schema in `astro.config.mjs` defines `SUPABASE_URL` and `SUPABASE_KEY` as server-side vars.
- Auth API routes use `context.redirect()` for errors (form-based); JSON API routes must return `Response` with appropriate HTTP status codes instead.
- `original-photos` bucket is currently **private** — Phase 1 migration will make it public to support permanent public URLs (user-chosen approach; see risk below).

## Desired End State

After this plan is complete:
- A logged-in user can visit `/objects`, see their object list (empty state included), and create a new object by entering a name.
- From the object detail page (`/objects/[objectId]`), the user can upload photos (drag-drop or click), see a thumbnail grid of uploaded photos, and delete individual photos.
- All photo bytes travel directly from the browser to Supabase Storage — they never transit the Cloudflare Worker body.
- The `profiles.storage_used_bytes` quota is enforced: uploads are blocked when the 100 MB limit would be exceeded, with a user-visible error message.
- `/dashboard` redirects to `/objects`.

### Key Discoveries (continued)

- `src/components/ui/button.tsx` (`button.tsx`): CVA-based Button component — reuse in new components.
- `src/components/auth/FormField.tsx` (`FormField.tsx`): reusable input wrapper — reuse for the create-object form.
- `src/components/auth/SubmitButton.tsx`: loading-state submit button — reuse.
- `src/components/auth/ServerError.tsx`: error display — reuse.
- Existing auth pages (`src/pages/auth/*.astro`) pattern: page-level Astro SSR + React island for the interactive form.

## What We're NOT Doing

- Thumbnail generation (browser canvas resize or server-side) — `thumbnail_url` remains `null` for all S-01 uploads; gallery scales full images via CSS.
- Object deletion — users can delete photos but not the object itself (deferred to a future slice or settings page).
- Object editing (name change) — creation only in S-01.
- Category selection on object creation — `category` field is `null` at creation; populated by AI in S-02.
- Version field exposed to user — `version` hardcoded to `1` on the server; not in the create-object form.
- Pagination on the object list or gallery — acceptable at MVP scale (≤10 photos per object, ≤100 MB total).
- Signed URL expiry management — users chose permanent public URLs (see risk note in Open Risks).

## Implementation Approach

Three sequential phases: (1) make `original-photos` bucket public via a new Supabase migration, add the `MAX_PHOTOS_PER_OBJECT` constant, and patch the DB type for `objects.version`; (2) implement all five JSON API routes; (3) build the Astro pages and React components that drive the UI.

Photo upload flow (two-step per file):
1. **Upload URL request**: browser sends `{ fileName, mimeType, fileSize }` to `POST /api/objects/[objectId]/photos/upload-url`. Server validates constraints (MIME, size, quota, object ownership, photo count), then calls `supabase.storage.from('original-photos').createSignedUploadUrl(path)` and returns `{ signedUrl, path }`.
2. **Direct upload**: browser PUTs the file bytes to the signed URL (straight to Supabase Storage — not through the Worker).
3. **Confirmation**: browser sends `{ path, fileName, mimeType, fileSize }` to `POST /api/objects/[objectId]/photos`. Server constructs the permanent public URL and inserts a `photos` row. The DB trigger increments `profiles.storage_used_bytes`.

## Critical Implementation Details

**Object ownership before issuing the signed URL**: the `/upload-url` route must SELECT the object from the `objects` table and verify it belongs to the requesting user _before_ including its ID in the storage path. Supabase Storage RLS enforces path-based ownership (first path segment must equal `auth.uid()`), but the objectId in the middle of the path is not RLS-validated at the storage level. A rogue caller who knows another user's objectId could craft an upload into an incorrect path without this explicit check.

**Public URL construction**: after the browser confirms its upload, the server calls `supabase.storage.from('original-photos').getPublicUrl(path).data.publicUrl` (where `path` is the value returned by the upload-url route and echoed back by the browser) and stores the result in `photos.original_url`. Using the SDK method instead of manual string concatenation avoids reliance on the internal URL format and removes the need to import `SUPABASE_URL` in the confirm route.

**Quota race condition**: the pre-upload quota check (in the upload-url route) is a soft guard — two concurrent uploads can both pass it. The hard enforcement is the `CHECK (storage_used_bytes <= 104857600)` constraint on `profiles`, enforced by the DB trigger on `photos` INSERT. If the trigger fires and the constraint is violated, the INSERT returns a `23514` Postgres error code. The confirmation route must catch this and return HTTP 409 with a quota-exceeded message. The 10-photo-per-object count limit is also only a soft guard (no DB-level backstop) — the same race applies and is accepted for MVP given low concurrent same-user same-object upload likelihood.

**JSON API error format**: new API routes return `Response` objects with JSON bodies and appropriate HTTP status codes — not `context.redirect()`. Establish this consistently: `{ error: string }` for all error responses.

---

## Phase 1: Foundation — Bucket Policy, Config, Types

### Overview

Make `original-photos` publicly accessible (so permanent public URLs work without auth), add the per-object photo limit constant, and correct the TypeScript type for `objects.version`.

### Changes Required

#### 1. New Supabase migration

**File**: `supabase/migrations/20260601000001_make_original_photos_public.sql`

**Intent**: Change the `original-photos` bucket from private to public so browsers can load photos via permanent public URLs without needing auth tokens.

**Contract**: SQL `UPDATE storage.buckets SET public = true WHERE name = 'original-photos';`. No RLS policy changes are needed — for public buckets, Supabase bypasses RLS for public URL reads automatically. The existing `"original-photos owner"` policy (`FOR ALL`, in `20260530000000_initial_schema.sql`) remains in place; its `WITH CHECK` clause continues to enforce owner-only writes (INSERT, UPDATE, DELETE).

#### 2. Config constant

**File**: `src/lib/config.ts`

**Intent**: Add the maximum photos per object limit as a named constant so API and UI reference the same value.

**Contract**: Export `maxPhotosPerObject: 10` under the existing `storageConfig` object.

#### 3. Database type correction

**File**: `src/types/database.generated.ts`

**Intent**: Correct the `objects.Row.version` field type from `string` to `number`, matching migration `20260530000006_objects_version_to_integer.sql` which changed the column to INTEGER.

**Contract**: Update `version: string` → `version: number` and `version?: string` → `version?: number` in both the `Row` and `Insert`/`Update` types for the `objects` table.

#### 4. Application types

**File**: `src/types/objects.ts`

**Intent**: Define typed shapes for objects and photos as returned by the API — cleaner than importing database-generated types directly into components.

**Contract**: Export `ObjectRecord` (id, name, version, category, createdAt) and `PhotoRecord` (id, objectId, originalUrl, fileSizeBytes, mimeType, createdAt). No Zod schemas needed here (validation is in the API routes); plain TypeScript interfaces are sufficient.

### Success Criteria

#### Automated Verification

- Migration applies without error: `npx supabase db push` (or `npx supabase migration up` locally)
- TypeScript compiles without errors: `npm run build` (or `npx tsc --noEmit`)
- `storageConfig.maxPhotosPerObject` is importable from `src/lib/config.ts`

#### Manual Verification

- Supabase dashboard → Storage → `original-photos` bucket → Public toggle is ON
- `src/types/database.generated.ts` has `version: number` for the objects table

**Implementation Note**: After all automated checks pass and the manual verification is confirmed by the human, proceed to Phase 2.

---

## Phase 2: API Routes

### Overview

Five JSON API routes that handle object and photo operations. All routes share the same auth pattern: call `createClient`, call `supabase.auth.getUser()`, return 401 if no session.

### Changes Required

#### 1. Objects list and create

**File**: `src/pages/api/objects/index.ts`

**Intent**: `GET` returns the authenticated user's objects sorted by `created_at DESC`; `POST` creates a new object with the provided name and `version = 1`.

**Contract**:
- `GET` → SELECT from `objects` WHERE `user_id = auth.uid()` ORDER BY `created_at DESC`. Returns `{ objects: ObjectRecord[] }`.
- `POST` accepts `{ name: string }` (Zod: required string, 1–100 chars). Inserts `{ user_id, name, version: 1 }`. Returns 201 `{ object: ObjectRecord }`.
- Both methods return 401 if no session; POST returns 422 on validation failure.

#### 2. Single object detail

**File**: `src/pages/api/objects/[objectId]/index.ts`

**Intent**: `GET` returns a single object along with its photos, or 404 if it doesn't belong to the current user.

**Contract**: SELECT object by `id` and `user_id = auth.uid()`; if not found, return 404. SELECT all photos for the object ordered by `created_at ASC`. Returns `{ object: ObjectRecord, photos: PhotoRecord[] }`.

#### 3. Signed upload URL

**File**: `src/pages/api/objects/[objectId]/photos/upload-url.ts`

**Intent**: `POST` validates upload constraints and returns a short-lived signed URL the browser will use to upload directly to Supabase Storage.

**Contract**: Accepts `{ fileName: string, mimeType: string, fileSize: number }` (Zod validation). Enforces in order:
1. Auth check (401 if no session).
2. Object ownership: SELECT object by `id` + `user_id`; 404 if not found.
3. MIME type in `storageConfig.allowedPhotoMimeTypes`; 422 if not.
4. `fileSize ≤ storageConfig.maxSinglePhotoBytes`; 422 if not.
5. Current quota check: fetch `profiles.storage_used_bytes`; reject with 409 if `storage_used_bytes + fileSize > storageConfig.Max_Client_Repository`.
6. Photo count check: COUNT photos WHERE `object_id = objectId`; reject with 409 if count ≥ `storageConfig.maxPhotosPerObject`.
7. Construct a unique storage path to prevent filename collisions: `const safeName = \`${crypto.randomUUID()}_${fileName}\`; const path = \`${userId}/${objectId}/${safeName}\``. Call `supabase.storage.from('original-photos').createSignedUploadUrl(path)`. Return 200 `{ signedUrl, path }`. The browser must pass this exact `path` back to the confirm route.

#### 4. Confirm upload and record photo

**File**: `src/pages/api/objects/[objectId]/photos/index.ts`

**Intent**: `POST` records a photo in the database after the browser has completed the direct-to-Supabase upload. `GET` returns the photo list for an object.

**Contract**:
- `POST` accepts `{ path: string, fileName: string, mimeType: string, fileSize: number }`. Validates auth + object ownership. Constructs the public URL via `supabase.storage.from('original-photos').getPublicUrl(path).data.publicUrl`. Inserts into `photos` with `{ user_id, object_id, original_url: originalUrl, thumbnail_url: null, file_size_bytes: fileSize, mime_type: mimeType }`. If DB returns Postgres error `23514` (check constraint violated), return 409 `{ error: "Storage quota exceeded" }`. Returns 201 `{ photo: PhotoRecord }`.
- `GET` → SELECT photos WHERE `object_id = objectId AND user_id = auth.uid()` ORDER BY `created_at ASC`. Returns `{ photos: PhotoRecord[] }`.

#### 5. Delete photo

**File**: `src/pages/api/objects/[objectId]/photos/[photoId].ts`

**Intent**: `DELETE` removes a photo from Supabase Storage and from the database. The DB trigger on DELETE automatically decrements `profiles.storage_used_bytes`.

**Contract**: Fetch the photo by `id AND object_id AND user_id` — return 404 if not found. Extract the storage path from `original_url` (parse last three segments: `{userId}/{objectId}/{fileName}`). DELETE the `photos` row first (the DB trigger decrements `profiles.storage_used_bytes`). Then call `supabase.storage.from('original-photos').remove([path])`. If the storage remove fails, the file is orphaned in Storage (same accepted risk as upload-confirm failures) but quota and gallery state remain consistent. Return 200 `{ success: true }`.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run build` (or `npx tsc --noEmit`)
- Linting passes: `npm run lint` (if configured)

#### Manual Verification

- `POST /api/objects` with `{ name: "Test jacket" }` returns 201 with an object record
- `GET /api/objects` returns the created object in the list
- `POST /api/objects/[id]/photos/upload-url` with valid `{ fileName, mimeType, fileSize }` returns a signed URL
- Browser PUT to the signed URL with a test JPEG → Supabase returns 200
- `POST /api/objects/[id]/photos` with the confirmed `{ path, fileName, mimeType, fileSize }` returns 201 with a photo record containing a valid `originalUrl`
- Loading the `originalUrl` directly in a browser returns the photo image (confirms bucket is public)
- `DELETE /api/objects/[id]/photos/[photoId]` removes the photo; subsequent GET returns the photo absent from the list

**Implementation Note**: After all automated checks pass and manual API testing is confirmed, proceed to Phase 3.

---

## Phase 3: Frontend — Pages and Components

### Overview

Build the Astro pages and React island components that surface the API routes as a usable UI. `/dashboard` redirects to `/objects`.

### Changes Required

#### 1. Dashboard redirect

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the current dashboard content with a redirect to `/objects`, making the object library the primary post-login destination.

**Contract**: Page-level redirect using `return Astro.redirect('/objects', 301)`. Remove the existing user email display and sign-out button (the top navigation bar or objects page layout will own these).

#### 2. Objects list page

**File**: `src/pages/objects/index.astro`

**Intent**: SSR page that displays the user's object library, with a "Create object" button. Unauthenticated users are redirected to `/auth/signin`.

**Contract**: On the server, call `createClient`, `supabase.auth.getUser()` — redirect to `/auth/signin` if no session. Fetch the user's objects via SELECT. Render the object list as static HTML (SSR). Mount the `<CreateObjectModal>` React island (client-side hydration) for the create flow. Each object card links to `/objects/[objectId]`.

#### 3. Object detail / gallery page

**File**: `src/pages/objects/[objectId].astro`

**Intent**: SSR page showing the object's name and a grid of its photos, with upload and delete affordances. Redirects to `/objects` if the object doesn't belong to the current user.

**Contract**: Validate `Astro.params.objectId`. Fetch object + photos server-side (same auth pattern). Pass `objectId`, `object`, and initial `photos` array as props to the `<PhotoGallery>` React island. The island handles optimistic UI for upload and delete without requiring a page reload.

#### 4. Create object form component

**File**: `src/components/objects/CreateObjectForm.tsx`

**Intent**: React component (modal or inline form) with a single "Name" text input. On submit, POSTs to `/api/objects` and navigates to the new object's detail page.

**Contract**: Uses existing `FormField`, `SubmitButton`, and `ServerError` components from `src/components/auth/`. On 201 response, does `window.location.href = /objects/${object.id}`. On 422, displays validation error inline. On 401, redirects to `/auth/signin`.

#### 5. Photo uploader component

**File**: `src/components/objects/PhotoUploader.tsx`

**Intent**: React component that accepts the `objectId` prop and handles the two-step upload flow: request signed URL → upload direct to Supabase → confirm to API.

**Contract**:
- Input: `objectId: string`, `onUploadComplete: (photo: PhotoRecord) => void`, `onError: (message: string) => void`, `currentCount: number` (to enforce the 10-photo limit client-side before issuing a request).
- Renders a file `<input>` (accept: `image/jpeg,image/png,image/webp`) and a drag-drop zone.
- For each file: validate MIME and size client-side (matching `storageConfig` constants), then execute the two-step upload flow.
- Shows per-file upload progress (HTML5 `XMLHttpRequest.upload.onprogress` or `fetch` with ReadableStream).
- Calls `onUploadComplete` with the new `PhotoRecord` on success.

#### 6. Photo gallery component

**File**: `src/components/objects/PhotoGallery.tsx`

**Intent**: React component that displays the photo grid, renders the uploader, and handles photo deletion.

**Contract**:
- Input: `objectId: string`, `initialPhotos: PhotoRecord[]`.
- Maintains local photos state, updated optimistically on upload and delete.
- Renders `<PhotoUploader>` at the top of the grid when `photos.length < maxPhotosPerObject`.
- Each photo cell: `<img src={photo.originalUrl}>` (CSS `object-cover` for consistent grid sizing), a delete button that calls `DELETE /api/objects/[objectId]/photos/[photoId]` and removes the photo from local state on 200.
- Empty state: "No photos yet — upload the first one."
- Shows `photos.length / maxPhotosPerObject` count (e.g., "3 / 10 photos").

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run build`
- Linting passes: `npm run lint` (if configured)

#### Manual Verification

- After login, browser navigates to `/objects` (dashboard redirect confirmed with 301)
- `/objects` renders the empty state: "No objects yet" with a "Create object" button
- Clicking "Create object" → form opens → enter name → submit → redirected to `/objects/[id]`
- Object detail page shows "No photos yet" gallery with upload area
- Drag a JPEG onto the upload zone → progress indicator → photo appears in grid
- Upload a second photo → appears alongside the first
- Click delete on a photo → photo removed from grid; page-level photo count decremented
- Upload 10 photos → uploader is hidden (limit reached); attempting an 11th returns an error
- Upload a file whose cumulative size would exceed 100 MB → error message: quota exceeded
- Uploading a non-JPEG/PNG/WebP file → client-side validation error before any API call
- `/dashboard` returns 301 redirect to `/objects`
- No regressions in `/auth/signin` and `/auth/signup` flows

**Implementation Note**: After all automated checks pass, perform manual browser testing as described. Confirm before marking Phase 3 complete.

---

## Testing Strategy

### Manual Testing Steps

1. Create an object, verify it appears in the list with correct name.
2. Upload a JPEG, PNG, and WebP to confirm all three MIME types are accepted.
3. Attempt upload of a .gif — confirm client-side rejection before any network call.
4. Upload a file >10 MB — confirm client-side rejection.
5. Upload photos up to the 10-photo limit — verify the upload zone disappears.
6. Delete one photo — verify it's removed from the grid and the count decrements.
7. Open two browser tabs, upload from both simultaneously — verify quota guard prevents exceeding 100 MB.
8. Navigate directly to `/objects/[unknownId]` — verify redirect to `/objects`.
9. Navigate directly to `/dashboard` — verify 301 redirect to `/objects`.
10. Open the network tab and confirm photo bytes go directly to Supabase Storage (not via the Worker).

## Performance Considerations

Gallery loads are bounded: maximum 10 photos × 10 MB = 100 MB of image content per object page. CSS `object-cover` with fixed grid cell dimensions prevents layout shift. No lazy loading required at MVP scale. If images load slowly, adding `loading="lazy"` to `<img>` tags is a zero-cost enhancement.

## Migration Notes

The `original-photos` bucket is being changed from private to public. Any existing objects in the bucket (from local dev testing) will be accessible without auth after this migration. The Storage RLS read policy for `original-photos` should be dropped as part of the migration since the public bucket setting supersedes it. Write-side RLS (INSERT / UPDATE / DELETE) remains, so only the bucket owner can upload or delete.

## Open Risks & Assumptions

- **Privacy trade-off (user-accepted)**: Making `original-photos` public means photo URLs are guessable if the `{user_id}/{object_id}/{file_name}` path structure is known. This conflicts with the "isolated per-account" NFR from the PRD. The user consciously accepted this trade-off for S-01 MVP. Before public launch, re-evaluate: consider switching back to signed URLs (60-minute TTL) for serving, with the raw path stored in the DB instead of the public URL.
- **Database types**: `database.generated.ts` is hand-maintained (Supabase CLI not linked to a live project). If the schema changes in future slices, the file must be updated manually or regenerated via `supabase gen types typescript`.
- **Orphaned storage files**: If the browser uploads to Supabase Storage but the confirmation request fails (network error), the file exists in the bucket but has no `photos` DB row. For MVP this is acceptable; a periodic cleanup job is a Phase 2 concern.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01 entry)
- PRD: `context/foundation/prd.md` (FR-003, FR-005, FR-006)
- Infrastructure: `context/foundation/infrastructure.md` (Cloudflare Workers 100 MB limit, signed URLs pattern)
- Foundation schema: `context/changes/db-schema-storage/` (F-01, status: impl_reviewed)
- Config constants: `src/lib/config.ts`
- Supabase client factory: `src/lib/supabase.ts`
- Existing auth route pattern: `src/pages/api/auth/signin.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — Bucket Policy, Config, Types

#### Automated

- [x] 1.1 Migration applies without error (npx supabase db push) — c11e54a
- [x] 1.2 TypeScript compiles without errors (npm run build or npx tsc --noEmit) — c11e54a
- [x] 1.3 storageConfig.maxPhotosPerObject importable from src/lib/config.ts — c11e54a

#### Manual

- [x] 1.4 original-photos bucket Public toggle is ON in Supabase dashboard — c11e54a
- [x] 1.5 database.generated.ts has version: number for objects table — c11e54a

### Phase 2: API Routes

#### Automated

- [x] 2.1 TypeScript compiles (npm run build)
- [x] 2.2 Linting passes (npm run lint)

#### Manual

- [x] 2.3 POST /api/objects returns 201 with object record
- [x] 2.4 GET /api/objects returns object in list
- [x] 2.5 POST upload-url returns signed URL
- [x] 2.6 Browser PUT to signed URL succeeds (Supabase returns 200)
- [x] 2.7 POST /api/objects/[id]/photos returns 201 with photo containing valid originalUrl
- [x] 2.8 originalUrl loads photo in browser (bucket is public)
- [x] 2.9 DELETE photo removes it from list

### Phase 3: Frontend — Pages and Components

#### Automated

- [ ] 3.1 TypeScript compiles (npm run build)
- [ ] 3.2 Linting passes (npm run lint)

#### Manual

- [ ] 3.3 /dashboard redirects 301 to /objects
- [ ] 3.4 /objects renders empty state with Create object button
- [ ] 3.5 Create object form submits and redirects to /objects/[id]
- [ ] 3.6 Photo drag-drop upload succeeds and appears in gallery
- [ ] 3.7 Delete photo removes it from gallery
- [ ] 3.8 10-photo limit hides uploader and blocks upload
- [ ] 3.9 Quota exceeded error shown correctly
- [ ] 3.10 Non-image file rejected client-side before API call
- [ ] 3.11 Direct navigation to /objects/[unknownId] redirects to /objects
- [ ] 3.12 Auth flows (signin, signup) have no regressions
