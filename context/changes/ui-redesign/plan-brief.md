# AI Sales Readiness Studio — Plan Brief

> Full plan: `context/changes/ui-redesign/plan.md`
> Research: `context/changes/ui-redesign/research.md`

## What & Why

Build a single-screen editor at `/app/editor` that collapses the existing 4-step
transformation wizard into one spatial layout: upload | preview | toolbar — all visible at
once. The goal is a professional "photo studio" feel where the user can upload a photo,
pick a style, run the AI transform, and compare before/after scores without navigating
between pages.

## Starting Point

A fully working multi-step wizard exists at `/objects/[objectId]/transform`
(`TransformationSession.tsx`). All backend APIs are production-ready (upload, transform,
analyze, save). No `/app/` route exists yet. Two reusable components (`PhotoUploader`,
`StylePicker`) exist but use dark-on-dark Tailwind classes.

## Desired End State

`/app/editor` renders a protected 3-panel grid (left: original photo + upload, center:
AI preview + before/after toggle, right: dark toolbar with style picker). A sticky score
footer shows 8-dimension quality scores before and after transformation. The editor works
in demo mode (mock BMW data, 2s fake transform) by default, and switches to real AI when
`?objectId=<uuid>` is present in the URL.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Panel theme | Mixed: dark right toolbar + light image panels | PhotoUploader and StylePicker are already dark-themed — housing them in a dark 320px rail avoids all restyling. | Plan |
| Transform in MVP | Hybrid: demo (2s fake) by default, real API when ?objectId= provided | Ensures the build always passes while keeping the real integration path open. | Plan |
| Upload in Phase 1 | Real PhotoUploader with `MOCK_OBJECT.id` | User wants upload visible immediately; the component renders correctly even if the mock UUID returns a 404 from the API. | Plan |
| ScoreBreakdown | Write new component | `ScoreGrid` is a private function in `AnalysisSection.tsx` — not exported, and dark-themed. New light-themed component needed. | Research → Plan |
| Error UX | Inline error card in center panel | Matches the existing `PhotoUploader` onError pattern; no toast infrastructure needed. | Plan |
| Mobile | Included in Phase 1 | Single CSS media query — zero cost to add while the grid is being written. | Plan |
| Phase count | 3 phases | Scaffold → Interactions → API wiring. Each phase produces a visually verifiable result. | Plan |

## Scope

**In scope:**
- New route `/app/editor` (protected, SSR auth check)
- 12 new/modified files (1 page, 1 data module, 10 components)
- Demo mode with mock data (no API calls for basic render)
- Real API mode gated on `?objectId=` URL param
- Mixed dark/light theme (dark right toolbar, light image panels)
- Mobile responsive (single breakpoint, stack at < 768px)

**Out of scope:**
- No changes to existing wizard (`/objects/[objectId]/transform`)
- No backend/API/migration changes
- No toast system
- No save/publish functionality
- No object creation from the editor
- No unit tests (project has no existing test suite for UI)

## Architecture / Approach

Single `<EditorShell client:load />` React root owns all state. The Astro page
(`editor.astro`) handles SSR auth guard + URL param parsing, then passes `objectId`
as a prop. `StylePicker` and `PhotoUploader` are imported unchanged — housed in the
dark toolbar and dark upload container respectively. `ScoreBreakdown` is a new
light-themed component that replicates `ScoreGrid`'s dimension list and colour logic.

```
editor.astro (SSR: auth check, parse ?objectId)
  └─ EditorShell (client:load — all state here)
      ├─ EditorHeader (object name, storage bar)
      ├─ OriginalImagePanel  ─┐ light canvas
      ├─ TransformedImagePanel ┘
      ├─ TransformToolbar (dark brand-navy)
      │   ├─ CategorySelector
      │   ├─ StylePicker (existing, dark, unchanged)
      │   └─ GuardrailBox (static)
      └─ ScoreFooter (sticky, light canvas)
          └─ ScoreBreakdown (new, light-themed)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Scaffold | 12 files, static 3-panel layout, build passes | TypeScript errors from type mismatches (QualityScoreSnapshot.overall, not overall_score) |
| 2. Interactions | Demo transform (2s fake), style selection, category switch, before/after toggle | StylePicker's internal Transform button owns the action — no separate CTA needed |
| 3. API wiring | Real upload, real transform, real "before" scoring when ?objectId= present | 60s blocking fetch — may timeout on Cloudflare free plan (30s wall clock) |

**Prerequisites:** User must be authenticated to access `/app/editor`. For Phase 3 testing, a real object UUID from Supabase is needed.

**Estimated effort:** ~3 focused sessions across 3 phases.

## Open Risks & Assumptions

- **Cloudflare 30s wall-clock limit**: `POST /api/transformations/start` blocks up to 60s. On the free plan this will timeout. Acceptable for MVP; streaming or async polling is a future slice.
- **MOCK_OBJECT.id in Phase 1**: The mock UUID won't exist in Supabase — upload will fail gracefully (shows `onError` message in the upload zone), but the component renders correctly.
- **StylePicker Transform button placement**: The transform action lives inside StylePicker's internal button (in the right toolbar), not in a prominent header/footer CTA. This is a UX tradeoff chosen for reuse speed.

## Success Criteria (Summary)

- `/app/editor` renders the 3-panel grid and is protected by auth (Phase 1).
- Clicking Transform shows a mock result after 2s delay and updates ScoreFooter to 7.9 (Phase 2).
- With a real `?objectId=`, upload and AI transform call real APIs and return results (Phase 3).
