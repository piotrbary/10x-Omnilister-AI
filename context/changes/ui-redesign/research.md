---
date: 2026-06-20T16:30:00+02:00
researcher: Claude Sonnet 4.6
git_commit: cb77b4e
branch: main
repository: 10x_Omnilister_AI
topic: "Single-screen AI Sales Readiness Studio editor at /app/editor"
tags: [research, ui-redesign, editor, transformation, components, routing]
status: complete
last_updated: 2026-06-20
last_updated_by: Claude Sonnet 4.6
---

# Research: Single-screen AI Editor — /app/editor

**Date**: 2026-06-20  
**Git Commit**: cb77b4e  
**Branch**: main

## Research Question

How to implement a single-screen "AI Sales Readiness Studio" editor at `/app/editor` that unifies
photo upload, transform style selection, AI transformation, and quality scoring — without touching
backend, auth, or DB contracts. Source: user-provided implementation prompt (see `change.md`).

---

## Summary

The codebase is well-prepared for this screen. All backend APIs are in place and working. The
existing multi-step wizard (`TransformationSession.tsx`) covers the same domain logic but in four
sequential steps — the new screen collapses it into a single spatial layout. The build chain is:

1. Add `/app` to `src/middleware.ts` `PROTECTED_ROUTES`.  
2. Create `src/pages/app/editor.astro` (SSR shell + auth check).  
3. Create `src/data/mockEditorData.ts` (mock object, images, styles, scores).  
4. Build `src/components/editor/` React components for each panel.  
5. Wire real API calls where the backend already exists (transform, upload, styles, save).  

No new npm packages needed. All types, utilities, and API endpoints required already exist.

---

## Detailed Findings

### 1. Routing & Auth

**No `/app/` directory exists** — `src/pages/app/editor.astro` is a safe new route, no conflicts.

**Middleware** (`src/middleware.ts:6`):
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/objects"];
```
→ **Must add `"/app"`** to protect `/app/editor`. Without this, the Astro page's manual redirect
is the only guard, which works but breaks `Astro.locals.user` population for non-redirected paths.

**Existing pattern** for protected Astro pages (`transform.astro:7-9`):
```typescript
const user = Astro.locals.user;
if (!user) return Astro.redirect("/auth/signin");
```
Use the same manual guard inside the page — belt and braces.

---

### 2. Existing APIs the editor screen can call (all production-ready)

| Need | API | Method | Notes |
|------|-----|--------|-------|
| Upload photo | `POST /api/objects/{objectId}/photos/upload-url` → PUT storage → `POST /api/objects/{objectId}/photos` | 3-step | Reuse `PhotoUploader.tsx` directly |
| List user styles (library) | `GET /api/styles?category={cat}` | GET | Returns `{id, name, prompt, description, usage_count, is_mine}` |
| Run transformation | `POST /api/transformations/start` | POST | Body: `{object_id, photo_ids, style_name, custom_prompt?}`. **Synchronous — blocks 10–60s** |
| Save result | `POST /api/transformations/{jobId}/save` | POST | Moves `status→saved`, increments storage_used |
| Score photo | `POST /api/objects/{objectId}/analyze` | POST | Body: `{photo_ids}`. Returns 8-dim scores + detected category |
| Feedback | `POST /api/transformations/{jobId}/feedback` | POST | Body: `{feedback: "improved"|"not_improved"}` |
| Get photo score | `GET /api/quality-scores/photo/{photoId}` | GET | Returns latest `QualityScoreSnapshot` |

**Synchronous transformation caveat**: `POST /api/transformations/start` calls OpenRouter
synchronously and can block for up to 60 s (config: `aiConfig.transformationTimeoutMs = 60_000`).
On Cloudflare Workers the CPU wall-clock limit is 30 s for free plans, higher on paid. Acceptable
for MVP; show loading state in the UI.

---

### 3. Reusable existing components

| Component | File | What to reuse |
|-----------|------|---------------|
| `PhotoUploader` | `src/components/objects/PhotoUploader.tsx` | Full drag-and-drop upload with XHR progress. Import directly into `OriginalImagePanel`. |
| `StylePicker` | `src/components/transformation/StylePicker.tsx` | Tab system (presets / library), lazy API call, `onSelect` callback. Can be wrapped or reimported as `TransformLibrary`. |
| `Button` | `src/components/ui/button.tsx` | All button variants. Use throughout editor. |
| `AnalysisSection` score logic | `src/components/AnalysisSection.tsx:132-320` | Score display (8 dims, color coding, sales-readiness badge). Extract only the display part — `ScoreBreakdown` can reuse the same colour logic. |
| `TransformationJobCard` | `src/components/transformation/TransformationJobCard.tsx` | Status-driven rendering (pending/failed/terminal), before/after display, score dimension table. Can be simplified/adapted. |

**Important**: Do NOT re-render `TransformationSession.tsx` — it is the old wizard. The new
screen replaces it with a spatial (not sequential) layout.

---

### 4. Types available for the editor

From `src/types/transformations.ts`:
```typescript
type TransformationStatus = "pending" | "full_ready" | "failed" | "saved";

interface TransformationJob {
  id: string;
  photoId: string;
  status: TransformationStatus;
  resultUrl: string | null;
  scoreBefore: QualityScoreSnapshot | null;
  scoreAfter:  QualityScoreSnapshot | null;
  errorMessage: string | null;
  retryCount:   number;
}

interface QualityScoreSnapshot {
  sharpness: number; lighting: number; background: number;
  object_features: number; damage_defects: number; labels: number;
  angle_coverage: number; sales_readiness: number;
  overall_score: number; is_sales_ready: boolean;
}
```

From `src/types/objects.ts`:
```typescript
interface PhotoRecord {
  id: string; objectId: string;
  originalUrl: string; thumbnailUrl?: string;
  fileSizeBytes: number; mimeType: string; createdAt: string;
}
interface ObjectRecord {
  id: string; name: string; version: number;
  category: ObjectCategory | null; createdAt: string;
}
```

From `src/lib/config.ts`:
```typescript
type ObjectCategory = "car" | "real-estate" | "item";
const scoringConfig = { salesReadinessThreshold: 7, maxScore: 10 };
```

From `src/lib/transformation-styles.ts`:
```typescript
const PRESET_STYLES: Record<ObjectCategory, PresetStyle[]>
// 9 presets: 3 per category. Each has: key, label, description, basePrompt
// car:           showroom, outdoor-clean, white-studio
// real-estate:   bright-interior, twilight-exterior, clean-professional
// item:          white-background, neutral-background, lifestyle-context
```

The prompt's "Polish UI" style names (e.g. "Dealer Premium") are mock display names.
When calling the API, use the existing `key` values from `PRESET_STYLES` (e.g. `"showroom"`).

---

### 5. Style conventions to follow

**Styling pattern** established in this session: use `style="..."` inline attributes with `--dt-*`
CSS custom properties, not hardcoded Tailwind colours. See `src/pages/objects/index.astro` for
the template:

```astro
<div style="background-color: var(--dt-color-canvas); border: 1px solid var(--dt-color-hairline); border-radius: var(--dt-radius-lg);">
```

**Available design tokens** (`src/styles/design-tokens.css`):
- `--dt-color-canvas` — white page background
- `--dt-color-surface` — off-white section bg (#F7F7F5)
- `--dt-color-primary` — Notion purple (CTA buttons)
- `--dt-color-brand-navy` — dark hero bg
- `--dt-color-charcoal`, `--dt-color-slate`, `--dt-color-steel` — text hierarchy
- `--dt-color-hairline` — borders
- `--dt-color-tint-*` — peach, rose, mint, lavender, sky, yellow
- `--dt-radius-md` (8px buttons), `--dt-radius-lg` (12px cards)
- `--dt-shadow-1`, `--dt-shadow-2`, `--dt-shadow-3`, `--dt-shadow-4` — elevation
- `--dt-space-*` — spacing scale

**Tailwind layout utilities** (safe to use for layout, not colour):
- `flex`, `grid`, `gap-*`, `min-h-screen`, `overflow-hidden`, `sticky bottom-0`

**Font**: `font-family: var(--dt-font-family)` (Inter) — already set on `body` via global.css.

---

### 6. Mock data to create

`src/data/mockEditorData.ts` should export:

```typescript
export const MOCK_OBJECT: ObjectRecord       // BMW 320d · v1, category: "car"
export const MOCK_PHOTOS: PhotoRecord[]      // 3 demo photos (use placeholder image URLs)
export const MOCK_STYLES: TransformStyle[]   // 6 styles matching prompt's Polish labels
export const MOCK_SCORE_BEFORE: QualityScoreSnapshot  // overall: 5.8, individual dims
export const MOCK_SCORE_AFTER:  QualityScoreSnapshot  // overall: 7.9
export const MOCK_STORAGE = { usedMb: 42, totalMb: 100 }
```

For placeholder images, use `https://placehold.co/800x600/f3f4f6/9ca3af?text=Orygina%C5%82`
(or similar Tailwind-palette placeholder). **No external CDN assets needed.**

Polish style labels from the prompt map to existing `PRESET_STYLES` keys:
| Polish label | key | category |
|---|---|---|
| Dealer Premium | showroom | car |
| Uczciwe defekty | outdoor-clean | car |
| Otodom Bright | bright-interior | real-estate |
| Clean Room | clean-professional | real-estate |
| Vinted Clean | neutral-background | item |
| Studio Ecommerce | white-background | item |

---

### 7. Component tree for the editor

```
src/pages/app/editor.astro          ← Astro SSR shell (auth check, Layout wrapper)
  └─ EditorShell (client:load)      ← React root, state management, layout grid
      ├─ EditorHeader                ← Object selector, category badge, storage, action buttons
      ├─ [left panel]
      │   └─ OriginalImagePanel      ← Upload dropzone (wraps PhotoUploader), thumbnail strip
      ├─ [center panel]
      │   └─ TransformedImagePanel   ← Transform preview, before/after toggle, action buttons
      ├─ [right panel]
      │   └─ TransformToolbar        ← Scrollable right rail
      │       ├─ TransformLibrary    ← Search + category tabs + TransformCard[]
      │       │   └─ TransformCard   ← Individual style card (selectable)
      │       ├─ CategorySelector    ← AI-suggested category + dropdown + confirm
      │       ├─ PromptEditor        ← Textarea + edit/save/publish buttons
      │       └─ GuardrailBox        ← Trust checklist (static)
      └─ ScoreFooter (sticky)        ← Before/after overall + MetricBar[] breakdown
          └─ MetricBar               ← Name + value + progress bar
```

All components under `src/components/editor/` as React `.tsx` (since the root `EditorShell`
must be `client:load` — React children don't need their own client directive).

Exception: `EditorHeader` can be Astro (`.astro`) if it has no interactive state. Given the
object selector and storage bar may need client state, make it `.tsx` and pass as prop.

---

### 8. State management plan for EditorShell

The single-screen layout needs this client state:

```typescript
// Image state
selectedPhotoId: string | null
uploadedPhoto: PhotoRecord | null

// Transform state
selectedStyleKey: string | null       // maps to PRESET_STYLES key
activeCategory: ObjectCategory        // "car" | "real-estate" | "item"
customPrompt: string                  // editable prompt textarea

// Job state
activeJob: TransformationJob | null   // current/last transformation result
isTransforming: boolean

// Score state
scoreBefore: QualityScoreSnapshot | null
scoreAfter:  QualityScoreSnapshot | null

// View state
previewMode: "after" | "before-after" // toggle
```

**State updates**:
- Upload → sets `uploadedPhoto`, triggers `POST /api/objects/{id}/analyze` (if real backend)  
- Style select → sets `selectedStyleKey`, loads `customPrompt` from preset  
- "Apply" click → calls `POST /api/transformations/start`, polls until done, sets `activeJob`  
- Score display → computed from `activeJob.scoreBefore` + `activeJob.scoreAfter`  

For demo mode (mock data): all state changes update local state only, no API calls needed
until "Zastosuj transformację" is clicked.

---

### 9. Layout CSS

The 3-panel + sticky footer layout requires a CSS grid that doesn't scroll the page body:

```css
/* EditorShell — full viewport, no body scroll */
.editor-shell {
  display: grid;
  grid-template-rows: auto 1fr auto; /* header / panels / footer */
  height: 100vh;
  overflow: hidden;
}

.editor-panels {
  display: grid;
  grid-template-columns: 1fr 1fr 320px; /* original / preview / toolbar */
  overflow: hidden;
}

/* Each panel scrolls independently */
.panel { overflow-y: auto; }

/* Mobile: stack vertically */
@media (max-width: 768px) {
  .editor-panels { grid-template-columns: 1fr; }
}
```

These styles can go in `src/styles/editor.css` (imported only by editor.astro) or as a
`<style>` block inside the page. Avoid adding them to global.css (scoped to editor only).

---

### 10. What NOT to touch

| File / area | Reason |
|---|---|
| `src/pages/api/**` | All backend contracts stay unchanged |
| `supabase/migrations/**` | No DB changes needed |
| `src/components/transformation/TransformationSession.tsx` | Old wizard, keep intact for `/objects/[objectId]/transform` |
| `src/lib/transformation-styles.ts` | Import and use, don't modify |
| `src/types/**` | Import only |
| `src/layouts/Layout.astro` | Import and use |
| Auth middleware logic | Only ADD `/app` to `PROTECTED_ROUTES`, no other changes |

---

## Code References

- `src/middleware.ts:6` — `PROTECTED_ROUTES` array (add `/app`)
- `src/lib/transformation-styles.ts:13` — `PRESET_STYLES` (import, don't copy)
- `src/lib/config.ts:30` — `scoringConfig.salesReadinessThreshold = 7`
- `src/components/objects/PhotoUploader.tsx:1` — reuse for upload panel
- `src/components/transformation/StylePicker.tsx:1` — style tab pattern to adapt
- `src/components/transformation/TransformationJobCard.tsx:1` — status rendering pattern
- `src/components/AnalysisSection.tsx:132` — score dimension display with color coding
- `src/types/transformations.ts` — `TransformationJob`, `QualityScoreSnapshot`
- `src/types/objects.ts` — `PhotoRecord`, `ObjectRecord`
- `src/styles/design-tokens.css` — all `--dt-*` tokens

---

## Architecture Insights

1. **Single root `client:load` component** is the right pattern here. Astro SSR page provides
   auth check + initial data, one React root (`EditorShell`) owns all client state. Child
   components are plain React (no separate `client:` directives needed).

2. **Mock-first, real-api-optional approach**: the editor can render fully with `mockEditorData.ts`
   and progressively call real APIs. This satisfies the prompt's "prefer mocked/demo data" while
   keeping the real integration path open.

3. **Transformation is synchronous on the server**: `POST /api/transformations/start` blocks for
   the full duration. The UI must show a loading state and disable the "Zastosuj" button during
   the call. No polling needed — the response IS the final result.

4. **Storage quota display**: `profiles.storage_used_bytes` isn't exposed via an API endpoint.
   For MVP, use `MOCK_STORAGE = { usedMb: 42, totalMb: 100 }` and add a note to wire it to a
   real profile query in a future slice.

5. **Category detection**: `POST /api/objects/{objectId}/analyze` returns a `category` field when
   it detects the object type. The editor can call this after photo upload to auto-populate
   the CategorySelector.

---

## Historical Context (from prior changes)

- `context/changes/db-schema-storage/plan.md` — storage quota enforcement; relevant to the
  "42 MB / 100 MB" header bar. Quota is a CHECK constraint on `profiles.storage_used_bytes`.
  No API endpoint for reading it yet — use mock for now.
- `context/changes/ai-transformation-session/plan.md` — the multi-step wizard being replaced.
  Confirm the old route (`/objects/[objectId]/transform`) stays unchanged.
- `context/changes/ai-analysis-score/plan.md` — 8-dimension scoring system. The same 8 dims
  (`sharpness`, `lighting`, `background`, `object_features`, `damage_defects`, `labels`,
  `angle_coverage`, `sales_readiness`) appear in `QualityScoreSnapshot`.

---

## Open Questions

1. **Object selector in EditorHeader**: should users be able to switch between objects directly
   in the editor header, or is it always "the current object"? For MVP: show object name as
   static text, load from mock/SSR. Object switching is a Phase 2 concern.

2. **Storage API**: `profiles.storage_used_bytes` has no GET endpoint. Plan shows a `GET /api/profile`
   or similar is needed. For now: mock. Flag this as a gap.

3. **Draft preview**: `aiConfig.draftPreviewTimeoutMs = 5_000` suggests the original design had
   two-phase (draft + full) rendering. The DB migration `20260602000001` removed `draft_url` and
   `draft_ready` status — transformation is now synchronous/single-phase. Show a single loading
   state, not two-phase.

4. **`/app/editor?objectId=...`** vs **`/app/editor`**: should the route accept an objectId
   query param to pre-load a specific object? For MVP: yes (pass `?objectId=xxx`), fall back to
   mock if not provided or if not found.
