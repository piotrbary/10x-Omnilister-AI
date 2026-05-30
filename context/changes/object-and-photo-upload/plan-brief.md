# Object Creation and Photo Upload — Plan Brief

> Full plan: `context/changes/object-and-photo-upload/plan.md`

## What & Why

S-01 is the first product slice: a logged-in user can create a named object and upload photos to it, then browse a gallery. This slice unlocks S-02 (AI scoring) and S-03 (transformation session) — without it, there are no photos to score or transform. The F-01 database schema is already in place (`impl_reviewed`); S-01's job is to build the API routes and UI on top of it.

## Starting Point

F-01 (`db-schema-storage`) delivered the `objects` and `photos` tables, Storage buckets, RLS, and quota-tracking triggers. No product routes exist yet — only auth API routes and auth pages are implemented. The Supabase client factory (`src/lib/supabase.ts`) and config constants (`src/lib/config.ts`) are already in place and will be reused.

## Desired End State

After this plan is complete, a user logs in and lands on `/objects` (the new primary landing page). They can create an object by entering a name, upload up to 10 photos per object directly to Supabase Storage from the browser, view a thumbnail grid, and delete individual photos. Photo bytes never transit the Cloudflare Worker body — they go client → Supabase Storage directly via signed upload URLs.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Upload architecture | Browser → Supabase direct (signed URL) | Photos must not transit the Cloudflare Worker body (100 MB cap causes silent 413s on high-res images) | Plan |
| URL serving strategy | Permanent public URLs stored in DB | Simpler than per-request signed URL generation; user accepted the privacy trade-off | Plan (user choice) |
| Version field | Auto-set to 1, hidden | No multi-version workflow exists in MVP; extra form field adds friction without value | Plan |
| Photo limit | 10 per object | Consistent with marketplace norms; keeps gallery manageable; avoids single-object quota exhaustion | Plan |
| Photo deletion | In scope (S-01) | Without delete, users can't correct wrong uploads and the 100 MB quota becomes unrecoverable | Plan |
| Thumbnail generation | CSS-scaled originals (thumbnail_url = null) | No server-side image processing needed; avoids workerd native-binary limitations | Plan |
| Nav structure | /objects replaces /dashboard | Directly surfaces the product's core value as the post-login landing page | Plan |

## Scope

**In scope:**
- New Supabase migration: make `original-photos` bucket public
- `storageConfig.maxPhotosPerObject = 10` constant
- Fix `objects.version` TypeScript type: `string` → `number`
- `src/types/objects.ts` application types
- 5 JSON API routes: objects list/create, single object, upload-url, photo confirm, photo delete
- `src/pages/objects/index.astro` (object library)
- `src/pages/objects/[objectId].astro` (gallery)
- 3 React components: `CreateObjectForm`, `PhotoUploader`, `PhotoGallery`
- `/dashboard` → 301 redirect to `/objects`

**Out of scope:**
- Object deletion
- Object editing
- Category selection at creation (AI-detected in S-02)
- Thumbnail generation
- Photo pagination
- Object list pagination

## Architecture / Approach

Client-side two-step upload: (1) API route validates constraints (MIME, size, quota, photo count, object ownership) and issues a Supabase signed upload URL; (2) browser PUTs file directly to Supabase Storage; (3) browser confirms to the API, which constructs the public URL and inserts the `photos` row. The DB trigger on `photos` INSERT auto-increments `profiles.storage_used_bytes`. Hard quota enforcement is the `CHECK` constraint on `profiles.storage_used_bytes` — if concurrent uploads race past the soft pre-check, the DB constraint and a `23514` error code is the safety net.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Foundation | Public bucket migration, config constant, fixed DB types | Migration may require Supabase CLI connected to a live project |
| 2. API Routes | 5 JSON endpoints; full upload + delete flow testable via curl | Object ownership check before signed URL issuance is critical — skip it and any user can write to any object's storage path |
| 3. Frontend | End-to-end browser flow: create object → upload photos → delete photos | Two-step upload UX (signed URL → direct PUT → confirm) needs clear loading states to avoid user confusion |

**Prerequisites:** F-01 (`db-schema-storage`) must be `impl_reviewed` ✓  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- **Privacy trade-off (user-accepted):** Public bucket means guessable photo URLs — conflicts with "isolated per-account" NFR. Revisit before public launch.
- **Orphaned storage files:** If the browser uploads but the confirmation API call fails, the file is in Storage without a DB row. Acceptable for MVP; add cleanup later.
- **DB types are hand-maintained:** `database.generated.ts` must be updated manually when schema changes.

## Success Criteria (Summary)

- User can create an object, upload photos, view a gallery, and delete photos without page reloads between gallery actions.
- Photo bytes never transit the Cloudflare Worker (confirmed via browser network tab).
- The 100 MB account quota and 10-photos-per-object limit are enforced with user-visible error messages.
