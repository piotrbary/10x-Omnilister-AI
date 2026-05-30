# Global Style Library — Implementation Plan

## Overview

Implements S-04: the global library of transformation styles/prompts. Builds on top of the `styles` table (F-01) and the transformation session UI (S-03). Users can publish their own prompts to the global library, browse and pick others' styles during a transformation, and report inappropriate styles. Three new surfaces: a Library tab inside S-03's StylePicker, a post-transformation "Save as Style" CTA in TransformationSession, and a standalone `/styles` browse page + `/styles/new` creation page.

## Current State Analysis

As of F-01 + S-03 Phase 1 implementation:
- `styles` table exists with all needed columns: `id, user_id (nullable), name, category, prompt, description, is_public (default false), usage_count (default 0), created_at, updated_at`
- RLS in place: `SELECT` allows `is_public = true OR user_id = auth.uid()`; write policies require `user_id = auth.uid()`; INSERT blocks `user_id = NULL` from the API
- 9 system presets seeded (`user_id = NULL, is_public = true`)
- `idx_styles_category_public` index on `(category, is_public)` already created
- `buildPrompt()` in `src/lib/transformation-styles.ts` falls back to using `styleKey` as the base prompt when the key doesn't match any hardcoded preset — DB styles can use this without touching the function
- S-03's `StylePicker` uses only hardcoded `PRESET_STYLES`; `POST /api/transformations/start` records `style_name` (preset key) but does not increment `usage_count`
- `styles` table has NO `is_reported` column yet — one migration needed

## Desired End State

A logged-in user can:
1. Browse all public styles (including other users' and system presets) on `/styles`, filtered by category and sorted by popularity
2. Create a style on `/styles/new` (standalone) or via the "Save as Style" CTA at the end of a transformation session
3. Select a library style during a transformation session via a "Library" tab in StylePicker
4. Report a style via a Report button (sets `is_reported = true` in DB for operator review)
5. Any style used in a transformation (preset or library) increments that style's `usage_count`

Verification: After a user publishes a style and another user starts a transformation using it, the `usage_count` increments and both users can see the style in the Library tab when transforming objects of that category.

### Key Discoveries

- `buildPrompt(styleKey, customOverride?)`: falls back to `styleKey` as the base prompt string when `styleKey` isn't a known preset key (`src/lib/transformation-styles.ts:88`). Phase 1 adds `buildPromptFromRaw(rawPrompt, customOverride?)` as the explicit path for DB styles; the fallback is not relied upon directly.
- `styles.prompt` stores raw prompts WITHOUT the no-distortion guardrail. The guardrail is appended by `buildPrompt()` at call time. Publishing a style should store only the raw prompt.
- `transformations.style_name TEXT NOT NULL` stores the preset key (e.g., `'showroom'`) for preset styles. For DB styles, it will store the style's UUID. The `POST /transformations/start` handler must differentiate: UUID format → DB lookup + usage_count increment; otherwise → preset key lookup.
- `src/lib/supabase.ts` factory pattern: all API routes call `createClient(Astro.request.headers, Astro.cookies)` and rely on RLS for data isolation.
- Auth check pattern from S-03: `context.locals.user` (set by middleware); return 401 if absent.
- Zod validation pattern for API bodies follows `src/pages/api/transformations/start.ts`.

## What We're NOT Doing

- Not adding edit or delete for published styles (read-only after publishing)
- Not building a "My Styles" management page (users see their styles in the Library tab with an `is_mine` indicator, but cannot manage them in a separate view)
- Not building a moderation dashboard (operator reviews `is_reported` styles directly in Supabase Studio)
- Not sending operator email alerts for reports (no email service in MVP)
- Not paginating the styles list (acceptable for MVP style count; flat list with category filter)
- Not supporting style previews (example before/after images per style — out of scope)
- Not implementing full-text search in the library (category tabs + usage-count sort is sufficient for MVP)
- Not building a "My Styles" profile page with usage analytics
- Not handling concurrent publish from multiple tabs

## Implementation Approach

Three sequential phases. Phase 1 is pure backend (one migration + API routes). Phase 2 extends existing S-03 UI surfaces. Phase 3 adds new standalone pages. Each phase is deployable independently given the prior phase's API is live.

Moderation strategy: two-layer. The no-distortion guardrail (`buildPrompt()`) is already applied to every transformation regardless of which style is used — this is a technical safety net already in place. Reactive reporting adds a `is_reported` flag so operators can identify and manually remove problematic styles via Supabase Studio.

---

## Phase 1: DB Migration + Styles API

### Overview

Adds the `is_reported` column to `styles` via a new migration, then implements three API routes covering style creation, public library listing, and reporting. Also updates `POST /api/transformations/start` to handle DB-backed styles (prompt fetch + usage_count increment).

### Changes Required

#### 1. Migration: `is_reported` + `reporter_user_id` on `styles`

**File**: `supabase/migrations/20260531000001_add_styles_report_columns.sql`

**Intent**: Add the two columns needed for reactive moderation. `is_reported` lets operators query flagged styles; `reporter_user_id` gives context on who flagged it (first reporter only — not a full multi-reporter log for MVP).

**Contract**:
```sql
ALTER TABLE styles
  ADD COLUMN is_reported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

Apply with `supabase db reset` (local) — the new migration runs after the existing ones.

#### 2. `GET /api/styles` — list styles

**File**: `src/pages/api/styles/index.ts`

**Intent**: Returns styles visible to the requesting user for a given category, sorted by usage_count descending. The Library tab calls this with `?category=...`; the global `/styles` page may add `?public_only=true`.

**Contract**:
- Method: GET; requires authenticated session (401 if absent)
- Query params: `category` (required — one of `'car' | 'real-estate' | 'item'`); `public_only` (optional boolean, default false)
- When `public_only=false` (default): SELECT WHERE category = $category (RLS returns `is_public = true OR user_id = auth.uid()` rows automatically — both public library + user's own private styles)
- When `public_only=true`: additionally filter WHERE `is_public = true`
- Order: `usage_count DESC, created_at DESC`
- Each row in response includes a computed `is_mine: boolean` (true if `user_id = context.locals.user.id`)
- Returns 200: `{ styles: Array<{ id, name, category, prompt, description, is_public, usage_count, is_mine, created_at }> }`
- Returns 400 if `category` is missing or invalid

#### 3. `POST /api/styles` — create style

**File**: `src/pages/api/styles/index.ts` (same file, additional export)

**Intent**: Creates a new style owned by the requesting user. Called by both the "Save as Style" post-transformation CTA and the standalone `/styles/new` form.

**Contract**:
- Method: POST; requires authenticated session (401 if absent)
- Body (Zod): `{ name: string (min 1, max 80); category: 'car' | 'real-estate' | 'item'; prompt: string (min 10, max 2000); description?: string (max 300); is_public?: boolean (default false) }`
- Inserts into `styles` with `user_id = context.locals.user.id`
- Returns 201: `{ style: { id, name, category, prompt, description, is_public, usage_count, created_at } }`
- Returns 400 on Zod validation failure

#### 4. `POST /api/styles/[styleId]/report` — report a style

**File**: `src/pages/api/styles/[styleId]/report.ts`

**Intent**: Marks a style as reported by setting `is_reported = true` and recording who reported it. Idempotent — re-reporting the same style is a no-op. Used by the Report button on style cards.

**Contract**:
- Method: POST; requires authenticated session (401 if absent)
- Validates that `styleId` exists and is visible to the user (RLS SELECT check: if the style isn't visible, it's as if it doesn't exist — return 404)
- UPDATEs `styles` SET `is_reported = true, reporter_user_id = auth.uid()` WHERE `id = styleId` AND `is_reported = false` (only sets on first report; subsequent reports are no-ops)
- Returns 200: `{ ok: true }` regardless of whether the style was already reported
- Note: users can technically report their own styles; operator handles edge cases via Supabase Studio

#### 1b. Migration: usage_count increment mechanism

**File**: `supabase/migrations/20260531000002_increment_styles_usage_count_trigger.sql`

**Intent**: The existing `styles_usage_count_guard` trigger (migration 007) blocks all direct UPDATEs to `usage_count`, including from API routes. This migration installs the safe increment path: a `SECURITY DEFINER` function that uses a transaction-local PostgreSQL session variable to bypass the guard, and an AFTER INSERT trigger on `transformations` that calls it automatically whenever a DB-style UUID is used.

**Contract**:
```sql
-- Extend the guard to allow SECURITY DEFINER system calls via session var
CREATE OR REPLACE FUNCTION protect_styles_usage_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_count IS DISTINCT FROM OLD.usage_count
     AND current_setting('app.system_counter_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'usage_count is managed by the system and cannot be changed directly';
  END IF;
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER function: sets the bypass var, increments, clears it
CREATE OR REPLACE FUNCTION increment_style_usage_count(p_style_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.system_counter_update', 'true', true);
  UPDATE styles SET usage_count = usage_count + 1 WHERE id = p_style_id;
  PERFORM set_config('app.system_counter_update', 'false', true);
END;
$$;

-- Trigger: fires AFTER INSERT on transformations; increments usage_count for DB styles
CREATE OR REPLACE FUNCTION on_transformation_created_increment_style_usage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.style_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM increment_style_usage_count(NEW.style_name::UUID);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_transformation_style_used
  AFTER INSERT ON transformations
  FOR EACH ROW EXECUTE FUNCTION on_transformation_created_increment_style_usage();
```

The trigger fires inside the same transaction as the `transformations` INSERT. `set_config(..., true)` is transaction-local — the bypass flag resets automatically on transaction end regardless of whether the PERFORM clears it explicitly.

#### 4b. `buildPromptFromRaw` — explicit function for raw-prompt DB styles

**File**: `src/lib/transformation-styles.ts`

**Intent**: Adds a named export for building a final prompt from a raw prompt string (as stored in `styles.prompt`), rather than routing through `buildPrompt()`'s preset-key fallback. This makes the DB-style prompt path explicit and independently testable.

**Contract**: Export `buildPromptFromRaw(rawPrompt: string, customOverride?: string): string`. Implementation is identical to `buildPrompt()`'s fallback branch — concatenates `rawPrompt`, optional `customOverride`, and the `NO_DISTORTION_GUARDRAIL`. Callers for preset styles continue using `buildPrompt(styleKey)`; callers for DB styles use `buildPromptFromRaw(style.prompt, custom_prompt)`.

#### 5. Update `POST /api/transformations/start` — DB style support

**File**: `src/pages/api/transformations/start.ts`

**Intent**: Extend the existing start handler to support DB-backed styles. When `style_name` is a UUID, fetch the style's prompt from the `styles` table. `usage_count` is incremented automatically by the `on_transformation_style_used` DB trigger (migration 1b) — the API route does not touch it.

**Contract**:
- Detect style type: if `style_name` matches strict UUID format (regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`), treat as DB style; otherwise treat as preset key
- For DB style: SELECT from `styles` WHERE `id = style_name` (RLS ensures the style is publicly visible); if not found return 400 "Style not found or not accessible"; build the final prompt via `buildPromptFromRaw(style.prompt, custom_prompt)` (exported from `src/lib/transformation-styles.ts` by Phase 1 — see F3 fix)
- No usage_count UPDATE in the route — the DB trigger handles it on INSERT
- For preset key: no change to existing behavior

### Success Criteria

#### Automated Verification

- `supabase db reset` applies cleanly with both new migrations appended — all existing tests still pass
- `is_reported` column present: `SELECT column_name FROM information_schema.columns WHERE table_name = 'styles' AND column_name = 'is_reported';` returns 1 row
- `on_transformation_style_used` trigger present: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'on_transformation_style_used';` returns 1 row
- `npm run typecheck` passes after adding `src/pages/api/styles/index.ts` and `src/pages/api/styles/[styleId]/report.ts`
- GET `/api/styles?category=car` without auth returns 401
- GET `/api/styles` without `category` param returns 400
- POST `/api/styles` with missing `name` returns 400 with validation error
- POST `/api/styles/[id]/report` for a non-existent styleId returns 404

#### Manual Verification

- POST `/api/styles` with valid body → row appears in Supabase Studio `styles` table with correct `user_id` and `is_public = false`
- GET `/api/styles?category=car` returns at least the 3 seeded car presets (is_public = true) plus any user's own styles for that category
- GET `/api/styles?category=car&public_only=true` returns only public styles (not the requesting user's private styles)
- POST `/api/styles/[id]/report` on a valid style → `is_reported = true` in DB; calling it again leaves `is_reported = true` and does not change `reporter_user_id`
- POST `/api/transformations/start` with a DB style UUID as `style_name` → transformation rows created; `styles.usage_count` incremented by 1; `transformations.style_name` stores the UUID

**Implementation Note**: Regenerate Supabase TypeScript types after the migration (`npx supabase gen types typescript --local > src/types/database.generated.ts`) so Phase 2 and 3 components get the updated `styles` row type including `is_reported`.

---

## Phase 2: StylePicker Library Tab

### Overview

Extends the S-03 `StylePicker` component with a "Library" tab that fetches user-visible public + own-private styles from `GET /api/styles`. The existing "Presets" tab is unchanged; the Library tab is a new tab rendered alongside it.

### Changes Required

#### 1. StylePicker — Library tab

**File**: `src/components/transformation/StylePicker.tsx`

**Intent**: Add a two-tab layout to the StylePicker: "Presets" (existing hardcoded list) and "Library" (DB-backed styles fetched on tab click). Selecting a style from either tab calls the same `onSelect(styleKey, customPrompt)` callback, but for Library styles the `styleKey` is the style's UUID.

**Contract**:

Tab structure: a tab bar with "Presets" and "Library" labels. "Presets" tab shows the existing `PRESET_STYLES[category]` cards — no change to this flow. "Library" tab:
- Lazy-fetched: fetch fires on first click, not on mount (avoids latency hit on every session start)
- Fetches `GET /api/styles?category=${category}` — returns public + user's own private styles
- Loading state: spinner while fetching
- Empty state: "No library styles for this category yet" with a link to `/styles/new`
- Each style card shows: `name`, `description`, usage count badge, and `is_mine` badge (if the user's own style). Clicking selects it.
- When a Library style is selected: calls `onSelect(style.id, undefined, style.prompt)` — the UUID becomes the `style_name`; the raw prompt is forwarded to `TransformationSession` for Save-as-Style pre-fill; `customOverride` from the textarea below still applies if the user typed anything
- When a Preset style is selected: calls `onSelect(style.key, undefined, style.basePrompt)` — same change for parity
- The custom prompt textarea below both tabs remains and works the same as before
- No Report button in the picker — reporting is available on the standalone `/styles` browse page

**Updated `onSelect` callback signature**: `(styleKey: string, customOverride?: string, rawPrompt?: string) => void`. `TransformationSession` stores `selectedStylePrompt: string | undefined` alongside `selectedStyleKey` at the moment of selection — no list lookup at save time. This extended signature is the Phase 2 contract addition needed by Phase 3's Save-as-Style pre-fill.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with the updated `StylePicker.tsx`
- `npm run build` completes without errors

#### Manual Verification

- In a transformation session, click the "Library" tab — a loading spinner appears, then the list of public styles for the object's category renders
- Clicking a library style card highlights it; the custom prompt textarea shows no pre-filled text (the style's prompt is not shown in the textarea — it's used server-side)
- Selecting a library style and clicking "Transform" → POST `/start` called with a UUID `style_name`; transformation proceeds normally; `usage_count` increments in DB
- Empty library state (no public styles for category) shows the "No library styles" empty state with `/styles/new` link
- Switching back to the "Presets" tab works without re-fetching
- Mobile (375px): tabs are full-width; style cards stack; scroll works

**Implementation Note**: After this phase passes all checks, the Library tab is live in the transformation flow. Confirm with the human that style selection works end-to-end before proceeding to Phase 3.

---

## Phase 3: "Save as Style" CTA + Standalone Pages

### Overview

Adds the remaining two style-authoring entry points: (1) an optional "Save as Style" section in the TransformationSession saving step, and (2) two new pages — `/styles` (global library browse) and `/styles/new` (standalone style creation). Shares a `StyleForm` component between the post-transformation CTA and the standalone form.

### Changes Required

#### 1. `StyleForm` — reusable style creation form

**File**: `src/components/styles/StyleForm.tsx`

**Intent**: A form component used in two places (post-transformation CTA and `/styles/new`). On submit, calls POST `/api/styles`. Handles loading state and error display.

**Contract**: Props: `{ category: ObjectCategory; initialPrompt?: string; onSuccess: (style: CreatedStyle) => void; onCancel?: () => void }`.

Fields:
- Style name (text input, required, max 80 chars)
- Category (read-only display — inherited from `category` prop; not editable in the form)
- Prompt (textarea, required, min 10 chars, max 2000 chars; pre-filled with `initialPrompt` if provided)
- Description (textarea, optional, max 300 chars)
- "Make public" toggle (checkbox, default unchecked = private)

On submit: POST `/api/styles`; on success call `onSuccess(style)`; on error display the server error message inline. On cancel: call `onCancel()` if provided.

#### 2. TransformationSession — "Save as Style" section in saving step

**File**: `src/components/transformation/TransformationSession.tsx`

**Intent**: In the saving step (step 4), add an optional "Save this prompt as a style" accordion below the list of photos to save. The user can expand it, fill in the form, and submit before clicking "Confirm save". Saving photos and saving a style are independent actions (submitting the style form does not save photos; "Confirm save" saves photos).

**Contract**:

The session component stores in state: `selectedStyleKey`, `selectedStylePrompt` (the raw base prompt captured at selection time via the extended `onSelect` — see Phase 2), and `customOverride`. Derive the pre-fill:
- If `customOverride` is non-empty: pre-fill with `customOverride`
- Else: pre-fill with `selectedStylePrompt ?? ''`

No list lookup or re-fetch needed. `selectedStylePrompt` is set when the user selects a style in step 2 and remains in state through all subsequent steps.

Render a collapsible section ("💡 Save this prompt as a style to use it again") above the "Confirm save" button. When expanded: renders `<StyleForm category={object.category} initialPrompt={derivedPrompt} onSuccess={() => setStyleSaved(true)} />`. After `onSuccess`, collapse the form and show a confirmation message ("Style saved!").

The "Confirm save" button is independent and always available. The "Save as Style" form does not block photo saving.

#### 3. `/styles` — Global library browse page

**File**: `src/pages/styles/index.astro`

**Intent**: A protected Astro page that renders the global style library. Lists all public styles for the selected category, sorted by usage count.

**Contract**: SSR page; middleware enforces authentication (redirect to `/auth/signin` if unauthenticated). Renders a `StyleLibrary` React island. Passes no initial data — the island fetches on mount.

#### 4. `StyleLibrary` — library browse component

**File**: `src/components/styles/StyleLibrary.tsx`

**Intent**: React island for the `/styles` page. Three category tabs; fetches `GET /api/styles?category=...&public_only=true` when a tab is selected. Each style card shows name, description, category badge, usage count, author badge (`is_mine`), and a Report button (hidden for user's own styles).

**Contract**: Props: none (the component manages all state internally).

Category tabs: 'car', 'real-estate', 'item' — labels "Car", "Real Estate", "Item". Default tab: 'car'. On tab switch, fetches the new category (lazy). Each style card:
- Name + description
- Category chip + usage count badge
- If `is_mine`: "My style" badge; no Report button
- If not `is_mine`: "Report" button (POST `/api/styles/[id]/report`; on success disable button, show "Reported")

A prominent "Create a style →" link at the top right links to `/styles/new`.

Loading state: spinner per tab. Empty state: "No public styles for this category yet. [Create the first one →]".

#### 5. `/styles/new` — Standalone style creation page

**File**: `src/pages/styles/new.astro`

**Intent**: Protected Astro page where users deliberately craft a new style without being in a transformation session. The user selects a category, writes a name, description, and prompt, then publishes or saves privately.

**Contract**: SSR page; middleware enforces authentication. Renders a `StyleCreatePage` React island with a category selector (defaulting to 'car') and the `StyleForm`. On successful creation: redirect to `/styles?category=${style.category}` so the user sees their new style in the library.

Implement the category selector as three radio buttons above the `StyleForm`. Switching category clears the form's prompt field.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on all new components and updated `TransformationSession.tsx`
- `npm run build` completes without errors
- No ESLint errors in `src/components/styles/` or the updated `TransformationSession.tsx`

#### Manual Verification

- Navigate to `/styles` → category tabs render; "Car" tab shows at least the 3 seeded presets with correct names and usage counts
- Click "Report" on a style that isn't mine → button changes to "Reported"; `is_reported = true` in DB; refreshing the page still shows "Reported" (Report button disabled)
- Navigate to `/styles/new` → select "Real Estate" category, fill in name + prompt, click "Make public", submit → redirected to `/styles?category=real-estate`; new style appears in the library with `usage_count = 0`
- In a transformation session for a 'car' object: complete a transformation using the "Showroom" preset; in the saving step, expand "Save this prompt as a style" → prompt textarea pre-filled with "Professional dealership showroom, neutral floor, even studio lighting"; name field is empty; submit → style saved; "Style saved!" confirmation appears; "Confirm save" still works independently
- In a transformation session with a custom prompt override typed in the StylePicker: in the saving step, "Save as Style" form pre-fills with the custom override text
- Mobile (375px): `/styles` page category tabs stack or scroll; style cards are single-column; "Create a style" link is accessible

**Implementation Note**: The Report button disabling is UI-only (the API is idempotent, so double-reports are safe). Confirm with the human that the Report flow persists across page refresh — the `is_reported` state should come from the API response `is_reported` field on each style card load.

---

## Known Limitations

- **Dual style_name representations for system presets**: selecting a system preset from the Presets tab stores `transformations.style_name = 'showroom'` (key) and does not increment `usage_count`; selecting the same preset from the Library tab stores `style_name = <uuid>` and does increment `usage_count`. Both produce identical final prompts. `usage_count` for system presets therefore reflects only Library-tab selections, not Presets-tab selections. This is an acceptable data asymmetry for MVP — `usage_count` is a popularity signal, not an audit log. Do not be surprised during testing when the same preset shows different `style_name` values.

## Testing Strategy

### Automated Tests

- TypeScript `tsc --noEmit` covers all new API routes and components
- Zod schema tests for `POST /api/styles` body (missing name, prompt too short, invalid category)
- GET `/api/styles` integration test: insert a private style for user A + a public style for user B; as user A, confirm both appear in response; confirm user B's private styles do NOT appear

### Integration Tests

- Create style → use in transformation → verify `usage_count` increments by exactly 1 per POST `/start` call
- POST `/api/styles/[id]/report` idempotency: report same style twice → `is_reported` remains `true`, `reporter_user_id` retains first reporter
- RLS: as user B, attempt to SELECT a style owned by user A with `is_public = false` → 0 rows returned (not 403)

### Manual Testing Steps

1. Full create-and-use flow: create a private style on `/styles/new`, use it in a transformation via the Library tab, verify `usage_count = 1` in DB
2. Publish flow: create style as private (`is_public = false`), verify it appears only to the creating user in GET `/api/styles`; note: since styles are read-only after publishing, making a style public happens at CREATE time via the "Make public" toggle
3. Report flow: as user B, report a style created by user A; check `styles` table in Supabase Studio → `is_reported = true`, `reporter_user_id = user B's id`
4. Post-transformation "Save as Style": use a preset style with a custom override typed → verify the override text is pre-filled in the Save as Style form (not the full prompt with guardrail)
5. Verify the no-distortion guardrail is NOT stored in `styles.prompt`: after creating a style, check `styles.prompt` in DB — guardrail text should be absent; trigger a transformation using the style → check `transformations.prompt` in DB — guardrail should be present

## Performance Considerations

- The `idx_styles_category_public` index on `(category, is_public)` already in place covers the primary query: `WHERE category = $1 AND is_public = true ORDER BY usage_count DESC`. The `usage_count` sort is post-filter — acceptable for MVP style counts.
- `usage_count` increment is a best-effort fire-and-forget `UPDATE` in `POST /transformations/start`. A failure to increment does not fail the transformation request. Under concurrent transformation starts with the same style, multiple concurrent UPDATEs may serialize at the DB level — this is correct behavior; PostgreSQL's MVCC handles it.
- StylePicker Library tab fetches lazily (on tab click, not on mount) — no extra RTT on every session start.

## Migration Notes

One new migration: `supabase/migrations/20260531000001_add_styles_report_columns.sql`. It adds two nullable columns to an existing table — no data migration needed; all existing rows get `is_reported = false` (default). Apply with `supabase db reset` locally and `supabase db push` to production.

After applying the migration, regenerate TypeScript types:
`npx supabase gen types typescript --local > src/types/database.generated.ts`

## References

- Roadmap: `context/foundation/roadmap.md` (S-04 section, prerequisites F-01 + S-03)
- PRD: `context/foundation/prd.md` (FR-013; NFR: author may publish styles; styles library is global and public)
- DB schema: `context/changes/db-schema-storage/plan.md` (Phase 1 item 9 — `styles` table contract; Phase 2 item 6 — `styles` RLS policies)
- S-03 components to extend: `context/changes/ai-transformation-session/plan.md` (Phase 2 item 5 — StylePicker; Phase 3 item 5 — TransformationSession)
- Existing style logic: `src/lib/transformation-styles.ts` (`PRESET_STYLES`, `buildPrompt`)
- Config constants: `src/lib/config.ts` (`scoringConfig.categories`)
- Auth pattern: `src/pages/api/auth/signin.ts`
- Supabase client factory: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB Migration + Styles API

#### Automated

- [x] 1.1 `supabase db reset` applies cleanly with both new migrations — `is_reported` column + `on_transformation_style_used` trigger present — be29699
- [x] 1.2 `npm run typecheck` passes after adding styles API routes — be29699
- [x] 1.3 GET `/api/styles?category=car` without auth returns 401 — be29699
- [x] 1.4 GET `/api/styles` without `category` param returns 400 — be29699
- [x] 1.5 POST `/api/styles` with missing `name` returns 400 — be29699
- [x] 1.6 POST `/api/styles/[id]/report` for non-existent styleId returns 404 — be29699

#### Manual

- [x] 1.7 POST `/api/styles` creates style row with correct `user_id` and `is_public = false` — be29699
- [x] 1.8 GET `/api/styles?category=car` returns at least the 3 seeded car presets — be29699
- [x] 1.9 GET `/api/styles?category=car&public_only=true` excludes requesting user's private styles — be29699
- [x] 1.10 POST `/api/styles/[id]/report` sets `is_reported = true`; second call is a no-op — be29699
- [ ] 1.11 POST `/transformations/start` with DB style UUID increments `usage_count` by 1

### Phase 2: StylePicker Library Tab

#### Automated

- [x] 2.1 `npm run typecheck` passes with updated `StylePicker.tsx`
- [x] 2.2 `npm run build` completes without errors

#### Manual

- [x] 2.3 Library tab renders public styles for the object's category on first click
- [x] 2.4 Selecting a library style and clicking Transform triggers POST `/start` with UUID `style_name`
- [x] 2.5 Empty library state shows "No library styles" message with `/styles/new` link
- [x] 2.6 Switching back to Presets tab works without re-fetching
- [x] 2.7 Mobile 375px: tabs and cards accessible

### Phase 3: "Save as Style" CTA + Standalone Pages

#### Automated

- [ ] 3.1 `npm run typecheck` passes on all new components and updated `TransformationSession.tsx`
- [ ] 3.2 `npm run build` completes without errors
- [ ] 3.3 No ESLint errors in `src/components/styles/` or updated `TransformationSession.tsx`

#### Manual

- [ ] 3.4 `/styles` page renders category tabs; Car tab shows at least 3 seeded presets with usage counts
- [ ] 3.5 Report button on a non-own style → disables after click; `is_reported = true` in DB; persists across page refresh
- [ ] 3.6 `/styles/new` form creates public style and redirects to `/styles?category=...`
- [ ] 3.7 Post-transformation "Save as Style" pre-fills prompt correctly (preset base or custom override, NOT the full guardrail-appended string)
- [ ] 3.8 "Confirm save" works independently of the "Save as Style" form
- [ ] 3.9 Mobile 375px: `/styles` page category tabs, cards, and Report button accessible
