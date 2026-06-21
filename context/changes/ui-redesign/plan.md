# AI Sales Readiness Studio — Editor Screen Implementation Plan

## Overview

Build a single-screen editor at `/app/editor` that unifies photo upload, transform style
selection, AI transformation, and quality scoring into one spatial layout — replacing the
four-step wizard model. The editor runs in demo mode by default (mock BMW object, fake 2s
transform) and switches to real API mode when `?objectId=<uuid>` is provided in the URL.

## Current State Analysis

- No `/app/` directory or route exists — safe to create.
- All backend APIs are production-ready: upload, transform (synchronous, up to 60s), analyze, save.
- `PhotoUploader` and `StylePicker` use dark-on-dark Tailwind styling (`border-white/20`,
  `text-white/60`). They are reused as-is inside a dark right toolbar and dark upload zone.
- `ScoreGrid` is a private function inside `AnalysisSection.tsx` (not exported, dark-themed).
  A new `ScoreBreakdown` component in the Notion light theme must be written from scratch.
- `PROTECTED_ROUTES` in `src/middleware.ts` does not include `/app` — one-line addition required.
- `QualityScoreSnapshot` type uses `overall` (not `overall_score`); `TransformationJob` uses
  snake_case fields (`score_before`, `score_after`, `result_url`, `photo_id`).
- `StartTransformationRequest` requires `photo_ids` (array 1–10), `object_id`, `style_name`.

## Desired End State

`/app/editor` loads in two modes:

- **Demo mode** (no `?objectId` param): renders MOCK_OBJECT (BMW 320d), MOCK_PHOTOS, and
  MOCK_SCORE_BEFORE (5.8). Clicking "Zastosuj transformację" shows a 2s spinner then reveals
  a mock "after" image and MOCK_SCORE_AFTER (7.9) — no API call.
- **Real mode** (`?objectId=<uuid>`): upload calls real storage API, transform calls
  `POST /api/transformations/start`, scoring calls `POST /api/objects/{id}/analyze`.

Route is protected: unauthenticated users redirect to `/auth/signin` (middleware + manual guard).

### Key Discoveries

- `QualityScoreSnapshot.overall: number` — use `.overall`, not `.overall_score`.
  (`src/types/transformations.ts:16`)
- `StylePicker.onSelect` fires only from StylePicker's internal "Transform" button — the
  transform action is owned by the right panel, not a separate footer/header CTA.
  (`src/components/transformation/StylePicker.tsx:67-74`)
- `PhotoUploader` returns `null` when `currentCount >= storageConfig.maxPhotosPerObject` — pass
  an accurate count or the component silently disappears.
  (`src/components/objects/PhotoUploader.tsx:24-26`)
- `DIMENSIONS` and `scoreColor` are private to `AnalysisSection.tsx` — copy the logic into
  `ScoreBreakdown.tsx` (the array is 8 elements; the colour function is 3 lines).

## What We're NOT Doing

- No changes to existing wizard at `/objects/[objectId]/transform`.
- No backend or API changes.
- No database migrations.
- No new npm packages.
- No toast notification system (error shown inline in preview panel).
- No object creation flow from the editor.
- No saving/publishing the result (deferred to a future slice).

## Implementation Approach

Mixed-theme editor: dark `var(--dt-color-brand-navy)` right toolbar (320px) houses `StylePicker`,
`CategorySelector`, and `GuardrailBox` — they are dark-themed already and slot in naturally.
Left and center image panels use `var(--dt-color-canvas)` (Notion light). `ScoreFooter` is
also light canvas, spanning full width below all three panels. A single `EditorShell` React
component (`client:load`) owns all state; child components receive props only.

---

## Phase 1: Scaffold — Route + Grid + Static Render

### Overview

Create all 12 files. Phase 1 produces a fully renderable static layout — no interactive state
yet. The build must pass at the end of this phase.

### Changes Required

#### 1. Middleware: protect `/app` route

**File**: `src/middleware.ts`

**Intent**: Ensure unauthenticated users hitting any `/app/*` route are redirected before
`Astro.locals.user` is accessed downstream.

**Contract**: Change line 4 from:
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/objects"];
```
to:
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/objects", "/app"];
```

---

#### 2. Mock data module

**File**: `src/data/mockEditorData.ts`

**Intent**: Provide stable typed mock objects so the editor renders correctly in demo mode
without any API calls.

**Contract**: Export these named constants (import all types from existing `src/types/`):

- `MOCK_OBJECT: ObjectRecord` — `{ id: "00000000-0000-0000-0000-000000000001", name: "BMW 320d", version: 1, category: "car", createdAt: "2026-01-01T00:00:00Z" }`
- `MOCK_PHOTOS: PhotoRecord[]` — 3 items. Use `https://placehold.co/800x600/f3f4f6/9ca3af?text=Oryginal` for `originalUrl`.
- `MOCK_SCORE_BEFORE: QualityScoreSnapshot` — `overall: 5.8`, `is_sales_ready: false`, individual dimensions between 4–6.
- `MOCK_SCORE_AFTER: QualityScoreSnapshot` — `overall: 7.9`, `is_sales_ready: true`, individual dimensions between 7–9.
- `MOCK_STORAGE: { usedMb: number; totalMb: number }` — `{ usedMb: 42, totalMb: 100 }`.

---

#### 3. Astro page shell

**File**: `src/pages/app/editor.astro` (create directory `src/pages/app/`)

**Intent**: SSR auth check + parse URL params + pass objectId to the React root.

**Contract**:
```typescript
const user = Astro.locals.user;
if (!user) return Astro.redirect("/auth/signin");
const objectId = Astro.url.searchParams.get("objectId"); // string | null
```
Render `<Layout title="Studio — Omnilister AI">` containing
`<EditorShell objectId={objectId} client:load />`.
Do NOT import Layout with `no-style` — use the standard Layout wrapper.

---

#### 4. EditorShell — grid layout (static)

**File**: `src/components/editor/EditorShell.tsx`

**Intent**: CSS grid root for the entire editor. In Phase 1 passes static mock props to all
children — no useState yet.

**Contract**:
- Props: `{ objectId: string | null }`
- Outer div: `style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100vh", overflow: "hidden" }}`
- Middle "panels" div: `style={{ display: "grid", gridTemplateColumns: "1fr 1fr 320px", overflow: "hidden" }}`
- Mobile override: create `src/styles/editor.css` with CSS classes for the grid containers
  (e.g. `.editor-shell`, `.editor-panels`). Import the file in `editor.astro` with
  `import '../styles/editor.css'`. Include the `@media (max-width: 768px)` rule there:
  set `grid-template-columns: 1fr` on `.editor-panels` and `height: auto; overflow: visible`
  on `.editor-shell`. Apply these class names to the divs instead of purely inline styles.
  Do NOT use a `<style>` JSX tag — it is global in React and persists across navigations.
- In Phase 1: import and render all panel components with props from `mockEditorData.ts`.
  Pass `objectId ?? MOCK_OBJECT.id` wherever a real objectId string is required.

---

#### 5. EditorHeader

**File**: `src/components/editor/EditorHeader.tsx`

**Intent**: Top bar showing the object name, category badge, and storage usage.

**Contract**: Props: `{ objectName: string; category: string | null; usedMb: number; totalMb: number }`.
Light canvas background (`var(--dt-color-canvas)`), `border-bottom: 1px solid var(--dt-color-hairline)`.
Left: `← Obiekty` back link to `/objects` + object name + category badge (tint-lavender pill).
Right: storage bar — `usedMb MB / totalMb MB` label + narrow progress div filled proportionally.

---

#### 6. OriginalImagePanel

**File**: `src/components/editor/OriginalImagePanel.tsx`

**Intent**: Show the current photo and the upload dropzone.

**Contract**: Props:
```typescript
{
  objectId: string;
  photos: PhotoRecord[];
  currentCount: number;
  onUploadComplete: (p: PhotoRecord) => void;
  onUploadError: (msg: string) => void;
}
```
Light canvas panel. Top: `<img>` tag displaying `photos[0]?.originalUrl` (object-fit: contain,
fill available height). Below: a dark-background container
`style={{ backgroundColor: "var(--dt-color-brand-navy)", borderRadius: "var(--dt-radius-lg)", padding: "16px" }}`
housing `<PhotoUploader objectId={objectId} currentCount={currentCount} onUploadComplete={onUploadComplete} onError={onUploadError} />`.
Pass `currentCount={photos.length}` where `photos` is a state array initialized from
`MOCK_PHOTOS` in demo mode (length 3, well below `maxPhotosPerObject: 10`).
In Phase 1 both callbacks are `() => {}`.

**Note (soft-guard race — accepted for MVP)**: `PhotoUploader` fires one XHR per file
concurrently for multi-file drops. The per-object photo limit check is soft (count-based,
not DB-enforced), so simultaneous uploads can temporarily exceed `maxPhotosPerObject: 10`.
This race is accepted for MVP. Before public launch, limit to single-file drops or add
client-side concurrency capping.

---

#### 7. TransformedImagePanel

**File**: `src/components/editor/TransformedImagePanel.tsx`

**Intent**: Preview area for the transform result, plus inline error state.

**Contract**: Props:
```typescript
{
  resultUrl: string | null;
  originalUrl: string | null;
  isTransforming: boolean;
  error: string | null;
  previewMode: "after" | "before-after";
  onTogglePreview: () => void;
}
```
Light canvas panel. States (mutually exclusive):
- `isTransforming === true`: full-panel loading overlay with spinner + "Przetwarzanie…" text.
- `error !== null`: centered red card with "Transformacja nie powiodła się. Spróbuj ponownie."
  and a "Spróbuj ponownie" `<button>` that calls `onTogglePreview` (re-used as retry in Phase 2).
- `resultUrl !== null && previewMode === "after"`: `<img>` filling the panel.
- `resultUrl !== null && previewMode === "before-after"`: side-by-side `<img>` original | result.
- Default (resultUrl null, not loading, no error): placeholder text "Wybierz styl i kliknij Zastosuj".
In Phase 1 pass `resultUrl: null, isTransforming: false, error: null, previewMode: "after"`.

---

#### 8. TransformToolbar

**File**: `src/components/editor/TransformToolbar.tsx`

**Intent**: Dark right rail (320px) containing category selector, style picker, and guardrail.

**Contract**: Props:
```typescript
{
  category: ObjectCategory;
  onCategoryChange: (c: ObjectCategory) => void;
  onTransform: (styleKey: string, customPrompt?: string) => void;
  isTransforming: boolean;
}
```
Full-height, overflow-y: auto. Background `var(--dt-color-brand-navy)`. Padding 16px.
Children in order: `<CategorySelector>`, `<StylePicker>` (imported from
`@/components/transformation/StylePicker`), `<GuardrailBox>`.
Pass StylePicker's `onSelect` as:
```typescript
(styleKey, customOverride) => {
  if (!isTransforming) onTransform(styleKey, customOverride);
}
```
In Phase 1 all callbacks are `() => {}`.

---

#### 9. CategorySelector

**File**: `src/components/editor/CategorySelector.tsx`

**Intent**: Let the user override the detected object category, which drives style preset display.

**Contract**: Props: `{ value: ObjectCategory; onChange: (c: ObjectCategory) => void }`.
Dark-themed (matches toolbar). Small label "Kategoria obiektu" above a styled `<select>` with
options: `car` → "Samochód", `real-estate` → "Nieruchomość", `item` → "Przedmiot".

---

#### 10. GuardrailBox

**File**: `src/components/editor/GuardrailBox.tsx`

**Intent**: Static trust checklist reminding users of ethical listing requirements.

**Contract**: No props. Dark-themed box with header "Zasady rzetelnego ogłoszenia" and 4 bullet points:
"Nie usuwaj widocznych wad bez oznaczenia", "Zachowaj zgodność z rzeczywistym wyglądem",
"Używaj stylu stosownego do kategorii", "Skonsultuj z kupującym przed publikacją".

---

#### 11. ScoreFooter

**File**: `src/components/editor/ScoreFooter.tsx`

**Intent**: Sticky full-width bottom bar displaying before/after quality scores.

**Contract**: Props: `{ scoreBefore: QualityScoreSnapshot | null; scoreAfter: QualityScoreSnapshot | null }`.
Light canvas background, `border-top: 1px solid var(--dt-color-hairline)`.
Position: `sticky bottom-0`. Layout: two columns ("Przed" | "Po"), each showing overall score
large + `<ScoreBreakdown snapshot={score} />`. When `scoreAfter` is null, right column shows
placeholder "—".

---

#### 12. ScoreBreakdown

**File**: `src/components/editor/ScoreBreakdown.tsx`

**Intent**: Render 8 quality dimensions with progress bars in the Notion light theme.
(Cannot import `ScoreGrid` — it is a private function inside `AnalysisSection.tsx` and
uses dark Tailwind classes incompatible with the light editor theme.)

**Contract**: Props: `{ snapshot: QualityScoreSnapshot }`.
Replicate the DIMENSIONS list from `src/components/AnalysisSection.tsx:32-41`:
`sharpness`, `lighting`, `background`, `object_features`, `damage_defects`, `labels`,
`angle_coverage`, `sales_readiness`.
Color logic (copy from AnalysisSection:51-55): `≥7` → `var(--dt-color-tint-mint)` fill with
`#10b981` text, `≥4` → amber, `<4` → red.
Use `--dt-color-hairline` row borders, `--dt-color-steel` for dimension labels,
`--dt-color-ink` for values.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` (or `npm run build`) exits with code 0 — no TypeScript errors.
- All 12 new/modified files exist at their specified paths.

#### Manual Verification

- `/app/editor` (unauthenticated): redirects to `/auth/signin`.
- `/app/editor` (authenticated): renders 3-panel grid — left light image panel, center light
  preview placeholder, right dark toolbar with category select and style presets.
- ScoreFooter: shows "Przed: 5.8" score bars, "Po: —" placeholder.
- PhotoUploader upload zone visible inside dark container in left panel.
- Mobile (< 768px): panels stack vertically, no horizontal overflow.
- No console errors.

**Pause here for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Interactive State — Style Selection + Demo Transform

### Overview

Add `useState` to `EditorShell` and wire all panel callbacks. Implement the demo transform:
2s fake delay then reveal `MOCK_SCORE_AFTER`. No real API calls in this phase.

### Changes Required

#### 1. EditorShell — state management + demo transform

**File**: `src/components/editor/EditorShell.tsx`

**Intent**: Replace static mock props with reactive state. Implement the demo transform flow.

**Contract**: Add these state fields:
```typescript
const [activeCategory, setActiveCategory] = useState<ObjectCategory>("car");
const [isTransforming, setIsTransforming] = useState(false);
const [resultUrl, setResultUrl] = useState<string | null>(null);
const [scoreAfter, setScoreAfter] = useState<QualityScoreSnapshot | null>(null);
const [previewMode, setPreviewMode] = useState<"after" | "before-after">("after");
const [transformError, setTransformError] = useState<string | null>(null);
```

`handleTransform(styleKey: string, customPrompt?: string)`:
- If `objectId === null` (demo mode): `setIsTransforming(true)`, wait 2000ms via `setTimeout`,
  then `setResultUrl("https://placehold.co/800x600/e8e5f8/7F6DF2?text=Transformed")`,
  `setScoreAfter(MOCK_SCORE_AFTER)`, `setIsTransforming(false)`.
- Real API branch: added in Phase 3.

`handleRetry`: clears `transformError` and `resultUrl`, re-enables the Apply flow.

Pass all state and handlers as props to children. Keep `MOCK_SCORE_BEFORE` as the initial
`scoreBefore` value (no API call for the "before" score in demo mode).

---

#### 2. TransformedImagePanel — before/after toggle

**File**: `src/components/editor/TransformedImagePanel.tsx`

**Intent**: Add a working toggle between "after" and "before-after" split views when a
result is available.

**Contract**: When `resultUrl !== null && !isTransforming`, show a small toggle button
"Porównaj" (toggles `previewMode` via `onTogglePreview`). In `before-after` mode, render
two equal-width `<img>` tags side by side. "Spróbuj ponownie" button in the error card calls
parent's `handleRetry` (passed as `onTogglePreview` prop — rename the prop to `onAction`
to serve both roles, or add a dedicated `onRetry` prop).

---

#### 3. TransformToolbar — disable during transform

**File**: `src/components/editor/TransformToolbar.tsx`

**Intent**: Prevent double-clicks by blocking `onTransform` while a transform is in flight.

**Contract**: The guard is already in Phase 1 (`if (!isTransforming) onTransform(...)`).
No additional changes needed unless StylePicker needs visual indication — in that case wrap
StylePicker in a `<div style={{ opacity: isTransforming ? 0.5 : 1, pointerEvents: isTransforming ? "none" : "auto" }}>`.

---

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0.

#### Manual Verification

- Select "Dealer Premium" preset in the toolbar → custom prompt textarea in StylePicker
  shows the preset's `basePrompt`.
- Change category dropdown to "Przedmiot" → style presets update to Vinted Clean / Studio
  Ecommerce / lifestyle-context.
- Click "Transform" (StylePicker's internal button) → 2s spinner covers center panel →
  mock "after" placeholder image appears.
- ScoreFooter: "Po: 7.9" appears after transform; sales-readiness badge turns green.
- "Porównaj" button appears → clicking shows side-by-side original vs result.
- Toolbar becomes semi-transparent (opacity 0.5) during the 2s transform.

**Pause here for manual confirmation before proceeding to Phase 3.**

---

## Phase 3: Real API Wiring (when `?objectId=` param is provided)

### Overview

When the page loads with `?objectId=<uuid>`, wire all API calls: real upload, real transform,
real "before" scoring. Demo mode (no param) remains unchanged.

### Changes Required

#### 1. EditorShell — real transform call

**File**: `src/components/editor/EditorShell.tsx`

**Intent**: When `objectId` is a real UUID, replace the fake delay with a real API call to
`POST /api/transformations/start`. Show the AI-generated result image on success.

**Contract**: Add a `selectedPhotoId` state field (`string | null`, initialized from
`MOCK_PHOTOS[0].id` in demo mode or from upload callback in real mode).

`handleTransform` real branch (when `objectId !== null`):
```
POST /api/transformations/start
Body: { object_id: objectId, photo_ids: [selectedPhotoId], style_name: styleKey, custom_prompt: customPrompt }
```
On 200: `const { jobs } = await res.json()`, `const job = jobs[0]`.
Guard: if `!job || job.status === "failed"` → `setTransformError(job?.error_message ?? "Transformacja nie powiodła się.")`.
Otherwise: `setResultUrl(job.result_url)`, `setScoreAfter(job.score_after)`.
On non-200: `setTransformError(data.error ?? "Transformacja nie powiodła się.")`,
`setIsTransforming(false)`.
Always: `setIsTransforming(false)` in finally.

---

#### 2. OriginalImagePanel — real upload with URL objectId

**File**: `src/components/editor/OriginalImagePanel.tsx`

**Intent**: When a real objectId is available, uploaded photos go to the real Supabase bucket
rather than failing silently against the mock UUID.

**Contract**: No code change needed — `objectId` is already passed as prop. The change is that
`EditorShell` now passes the real URL objectId instead of `MOCK_OBJECT.id`. The `onUploadComplete`
callback in EditorShell (Phase 3) must update `selectedPhotoId` and trigger scoring:
```typescript
onUploadComplete: (photo: PhotoRecord) => {
  setSelectedPhotoId(photo.id);
  setPhotos(prev => [photo, ...prev]);
  void analyzePhoto(photo.id); // see item 3 below
}
```

---

#### 3. EditorShell — "before" scoring after upload

**File**: `src/components/editor/EditorShell.tsx`

**Intent**: Auto-score the uploaded photo to show its "before" quality immediately in the footer.

**Contract**: `analyzePhoto(photoId: string)`:
```
POST /api/objects/{objectId}/analyze
Body: { photo_ids: [photoId] }
```
On success: `setScoreBefore(data.scores[0].snapshot)` (if scores array is non-empty and no error).
On failure: log to console, do not update score (footer shows previous value).

---

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0.

#### Manual Verification

- Navigate to `/app/editor?objectId=<real-uuid-from-supabase>`.
- Upload a photo → progress bar appears → photo displays in left panel.
- ScoreFooter "Przed" updates with real AI score after upload.
- Select a style, click Transform → loading spinner for up to 60s.
- Real AI-transformed image appears in center panel.
- ScoreFooter "Po" shows real score.
- Network tab: `POST /api/transformations/start` returns 200 with `result_url` and `score_after`.
- Error case: use an invalid objectId → error card appears in center panel with message.

**Pause here for manual confirmation.**

---

## Testing Strategy

### Unit Tests

No unit tests in this implementation — the project has no existing test suite for UI components
(`test-base: none` per test-plan discovery). Tests are a Phase 2 concern per `test-plan.md`.

### Manual Testing Steps

1. Start dev server: `npx wrangler dev` (or `npm run dev`).
2. Unauthenticated: visit `/app/editor` → must redirect to `/auth/signin`.
3. Log in, visit `/app/editor` → layout renders (3 panels visible, no console errors).
4. Demo transform: select style, click Transform → 2s delay → mock score 7.9 appears.
5. Category switch: change to "Nieruchomość" → presets change to Otodom Bright / Clean Room.
6. Mobile: resize browser to < 768px → panels stack vertically.
7. Real mode (if real objectId available): `/app/editor?objectId=<uuid>` → upload + transform.

## Performance Considerations

- `EditorShell` uses `client:load` — it hydrates immediately on page load. This is intentional
  for the editor context (instant interactivity). No lazy-loading of panels.
- The 60s synchronous transform blocks the browser tab's fetch. On Cloudflare free plan (30s
  wall clock limit), this may timeout. Acceptable for MVP; a future slice can add streaming.
- `StylePicker` lazy-loads `/api/styles` only when the "Library" tab is clicked — no eager fetch.

## Migration Notes

None — no schema or API changes. The new route coexists with all existing routes.

## References

- Research: `context/changes/ui-redesign/research.md`
- StylePicker (import unchanged): `src/components/transformation/StylePicker.tsx`
- PhotoUploader (import unchanged): `src/components/objects/PhotoUploader.tsx`
- Score dimensions + colour logic: `src/components/AnalysisSection.tsx:32-55`
- Design tokens: `src/styles/design-tokens.css`
- Transform request schema: `src/types/transformations.ts:39-46`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles.

### Phase 1: Scaffold — Route + Grid + Static Render

#### Automated

- [x] 1.1 `npx tsc --noEmit` exits 0 (no TypeScript errors)
- [x] 1.2 All 12 new/modified files exist at their specified paths

#### Manual

- [ ] 1.3 `/app/editor` unauthenticated → redirects to `/auth/signin`
- [ ] 1.4 `/app/editor` authenticated → 3-panel grid renders (left light / center light / right dark)
- [ ] 1.5 ScoreFooter shows "Przed: 5.8" score bars; "Po: —" placeholder
- [ ] 1.6 PhotoUploader upload zone visible inside dark container in left panel
- [ ] 1.7 Mobile (< 768px): panels stack vertically, no horizontal overflow
- [ ] 1.8 No console errors on page load

### Phase 2: Interactive State — Style Selection + Demo Transform

#### Automated

- [ ] 2.1 `npx tsc --noEmit` exits 0

#### Manual

- [ ] 2.2 Select "Dealer Premium" → StylePicker prompt textarea shows the preset's basePrompt
- [ ] 2.3 Change category to "Przedmiot" → style presets update
- [ ] 2.4 Click Transform → 2s spinner → mock after image + score 7.9 appears
- [ ] 2.5 ScoreFooter "Po: 7.9" appears; sales-readiness badge is green
- [ ] 2.6 "Porównaj" toggle shows side-by-side view
- [ ] 2.7 Toolbar dims (opacity 0.5) during transform; double-click does not double-trigger

### Phase 3: Real API Wiring (when `?objectId=` param is provided)

#### Automated

- [ ] 3.1 `npx tsc --noEmit` exits 0

#### Manual

- [ ] 3.2 `/app/editor?objectId=<real-uuid>` — upload photo → progress bar → photo appears in panel
- [ ] 3.3 ScoreFooter "Przed" updates with real AI score after upload
- [ ] 3.4 Real transform → loading spinner → AI-generated image appears
- [ ] 3.5 ScoreFooter "Po" shows real score from API
- [ ] 3.6 Error case: invalid objectId → inline error card appears in center panel
