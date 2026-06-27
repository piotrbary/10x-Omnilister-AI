# Artifact 1 — Territory Map

> Git archaeology session. Branch: `UX_REDESIGN`. Date: 2026-06-24.
> Scope: last 60 days (activity) + last 12 months (churn/coupling).

---

## Repo & Deploy

| | |
|---|---|
| **Repo** | https://github.com/piotrbary/10x-Omnilister-AI |
| **Branch** | `UX_REDESIGN` |
| **Live URL** | https://omnilister-ai.peter-be-cloud.workers.dev |
| **Platform** | Cloudflare Workers (`wrangler deploy`) |
| **Last deploy** | 2026-06-21 (secret change; no code deploy since) |

---

## Contributors (last 60 days)

| Author | Email | Commits | Lines changed |
|--------|-------|---------|---------------|
| piotrbary | piotr.barylak@gmail.com | 30 | 51 065 |
| Claude Sonnet 4.6 (co-author) | noreply@anthropic.com | 21 | — |
| Claude Opus 4.7 (co-author) | noreply@anthropic.com | 9 | — |

All 30 commits were AI-assisted via `Co-Authored-By`.

---

## 5 Most Problematic Areas Fixed (last 60 days)

1. **AI provider instability** (`cb77b4e`) — two-step DALL-E 3 + GPT-4o Vision replaced with single OpenRouter → Gemini 2.5 Flash call. Removed `OPENAI_API_KEY` dependency entirely.

2. **Non-ASCII filename crash on upload** (`3c1994c`) — Supabase Storage rejected Polish diacritics (e.g. `samochód.png`). Fixed via NFD normalization + unsafe-char stripping.

3. **Transformation API fragility** — `src/pages/api/transformations/start.ts` touched 3×; inconsistent responses stabilized with shared `json()` helper.

4. **Editor missing core interactions** (`c6f9630`) — photo delete, result save/discard, and prompt library drawer were all absent from initial design. 855 lines added across 5 components. See detail below.

5. **ESLint / type-safety drift** — `database.generated.ts` regenerated 4×; `StylePicker.tsx` ESLint void violation. Symptom: DB migrations not coupled to type regeneration.

### Detail: Editor gap (`c6f9630`)

The initial editor design shipped display-only panels — no way to act on results or manage photos.

| Gap | Fix |
|-----|-----|
| No delete photo | `×` badge on thumbnails → `DELETE /api/objects/:objectId/photos/:photoId` |
| No save/discard result | 3-button action bar (Zapisz / Odrzuć / Porównaj) → `POST /api/transformations/:jobId/save` |
| No prompt library | New `PromptDrawer` (slide-over) fetches `/api/styles`; injects into toolbar via `forwardRef`/`useImperativeHandle` |
| No `currentJobId` tracking | Added to `EditorShell` state; extracted reusable `Modal` component |

Root cause: design covered the happy path (upload → transform → view) but skipped result confirmation and asset management.

---

## Top 10 Hot Folders (last 12 months, noise filtered)

| # | Folder | Edits |
|---|--------|-------|
| 1 | `src/lib` | 21 |
| 2 | `src/components/editor` | 19 |
| 3 | `src/components/transformation` | 8 |
| 4 | `src/types` | 6 |
| 5 | `src/components/auth` | 7 |
| 6 | `src/pages/api/transformations` | 5 |
| 7 | `src/pages/api/objects/[objectId]` | 5 |
| 8 | `src/pages/auth` | 5 |
| 9 | `src/pages/objects` | 4 |
| 10 | `src/components/objects` | 4 |

## Top 10 Hot Files (last 12 months, noise filtered)

| # | File | Edits |
|---|------|-------|
| 1 | `src/lib/config.ts` | 5 |
| 2 | `src/pages/api/transformations/start.ts` | 3 |
| 3 | `src/lib/transformation-processor.ts` | 3 |
| 4 | `src/lib/openrouter-images.ts` | 3 |
| 5 | `src/middleware.ts` | 3 |
| 6 | `src/types/transformations.ts` | 3 |
| 7 | `src/components/transformation/TransformationSession.tsx` | 3 |
| 8 | `src/components/editor/TransformToolbar.tsx` | 3 |
| 9 | `src/components/editor/EditorShell.tsx` | 3 |
| 10 | `src/types/analysis.ts` | 2 |

---

## Coupling Analysis

### Strongest pairs (co-change in same commits)

| Pair | Co-commits |
|------|-----------|
| `openrouter-images.ts` + `transformation-processor.ts` | 3× |
| `config.ts` + `src/pages/api/*` | 2× |
| `config.ts` + `transformation-processor.ts` | 2× |
| `config.ts` + `openrouter-images.ts` | 2× |

### Strongest triple

`openrouter-images.ts` + `transformation-processor.ts` + `src/pages/api/transformations` — 2× together.

### Cross-module hubs (files co-changing with most distinct partners)

| File | Distinct partners | Type |
|------|-----------------|------|
| `src/middleware.ts` | 77 | **Real hub** — touched in every auth+routing+API change |
| `src/lib/config.ts` | 52 | **Real hub** — touched at every AI provider / storage change |
| `src/styles/global.css`, `Layout.astro`, auth pages | 75 (inflated) | **Sweep artifact** — one large redesign commit (`0ec14f4`, 49 files) |

### Conclusions per top-3 folder

**`src/lib` (21 edits):** `openrouter-images.ts`, `transformation-processor.ts`, `config.ts` form a single logical AI pipeline split across three files. Change one → change all. Candidate for `src/lib/ai/` barrel.

**`src/components/editor` (19 edits):** Well-encapsulated — rarely pulls changes outside its folder. `EditorShell` ↔ `TransformToolbar` are tightly coupled via `ToolbarHandle`/`forwardRef`.

**`src/pages/api/transformations` (5 edits):** Leaking abstraction — `start.ts` changes in lockstep with `transformation-processor.ts`. The lib layer should be the only entry point; route handler should be a thin HTTP adapter.

### Real "common denominator" for the whole repo

**`src/middleware.ts`** — appears in every commit that touches auth, routing, or API together.
**`src/lib/config.ts`** — appears in every commit that touches AI provider, storage, or types.

These two are the seams where cross-cutting concerns land. High change frequency here is a signal, not a bug.

---

## File Existence Verification

All strongly-coupled files confirmed present in working tree as of 2026-06-24:

- ✓ `src/middleware.ts`
- ✓ `src/lib/config.ts`
- ✓ `src/lib/openrouter-images.ts`
- ✓ `src/lib/transformation-processor.ts`
- ✓ `src/lib/supabase.ts`
- ✓ `src/types/transformations.ts`
- ✓ `src/types/analysis.ts`
- ✓ `src/pages/api/transformations/start.ts`
- ✓ `src/pages/api/objects/[objectId]/index.ts`
- ✓ `src/components/editor/EditorShell.tsx`
- ✓ `src/components/editor/TransformToolbar.tsx`
- ✓ `src/components/transformation/TransformationSession.tsx`
