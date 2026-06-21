# Global Style Library — Plan Brief

> Full plan: `context/changes/global-style-library/plan.md`

## What & Why

S-04 adds the global library of transformation styles and prompts. Users can publish their own prompts to a shared library, pick other users' styles when transforming photos, and report inappropriate content. This is the viral loop mechanic in the PRD: good styles attract users, popular styles rise to the top, and the library grows with every transformation session.

## Starting Point

The `styles` table (F-01) is fully built: columns, RLS, indexes, and 9 seeded system presets. S-03 provides the `StylePicker` component and `POST /api/transformations/start` handler — both need extending. The only new migration needed is two columns for reactive moderation (`is_reported`, `reporter_user_id`).

## Desired End State

Users can browse the global library on `/styles` (category tabs, sorted by usage), create styles on `/styles/new` or via a "Save as Style" CTA at the end of a transformation session, and pick library styles via a new "Library" tab in the transformation StylePicker. Any style used in a transformation increments its `usage_count`. Inappropriate styles can be flagged via a Report button; flagged rows are reviewed by the operator in Supabase Studio.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Moderation strategy | Auto-guardrail (existing) + reactive reporting | Guardrail is already in `buildPrompt()`; reporting adds a DB trace for operator review with zero extra latency | Plan |
| Styles after publish | Read-only (no edit/delete) | Simplest CRUD surface; published prompts are immutable — users who adopted a style get a stable contract | Plan |
| StylePicker integration | Separate "Library" tab alongside "Presets" | Presets always available; Library tab fetches lazily only when clicked — no added RTT on every session start | Plan |
| Style publication entry points | Session end CTA + standalone `/styles/new` | Captures the natural "I found a great prompt" moment post-transformation AND covers deliberate style authoring | Plan |
| Usage count trigger | On POST `/transformations/start` | Counts intent-to-use (not just saves); one DB UPDATE per job batch; simple, no extra triggers | Plan |
| Report flow | `is_reported` boolean in DB, no email alert | Sufficient for MVP with small user base; operator queries Supabase Studio directly | Plan |
| Library browse | Category tabs + `usage_count DESC` sort | Matches the existing `idx_styles_category_public` index; surfaces popular styles without search complexity | Plan |

## Scope

**In scope:**
- DB migration: `is_reported + reporter_user_id` on `styles`
- API: POST `/api/styles` (create), GET `/api/styles` (list), POST `/api/styles/[id]/report`
- Update POST `/api/transformations/start`: detect DB-style UUID vs preset key; increment `usage_count`
- StylePicker: "Library" tab with lazy fetch, empty state, mobile layout
- TransformationSession: "Save as Style" collapsible in saving step (pre-fills prompt from session state)
- `/styles` page: global library browse, Report button, "Create a style" link
- `/styles/new` page: standalone style creation with category selector

**Out of scope:**
- Style editing/deletion after publish
- "My Styles" management page
- Moderation dashboard or email alerts
- Style preview images (before/after examples per style)
- Full-text search in the library
- Pagination (MVP style counts are small)
- Multi-reporter logging (only first reporter stored)

## Architecture / Approach

Backend: three API routes in `src/pages/api/styles/`. `GET /api/styles` relies on Supabase RLS (returns `is_public = true OR user_id = auth.uid()` automatically); `?public_only=true` adds an explicit public-only filter. DB styles and preset keys are distinguished by UUID format in `POST /api/transformations/start`; `buildPrompt(style.prompt)` reuses the existing fallback path (line 88: `base = style?.basePrompt ?? styleKey`).

Frontend: `StyleForm` is a shared component used by both the post-transformation CTA (inside `TransformationSession`) and the standalone `/styles/new` page. The Library tab in `StylePicker` fetches lazily. No new shared state between components — each surface is self-contained.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB Migration + Styles API | Migration + 3 API routes + updated `/start` | UUID detection regex must not collide with preset keys (low risk — presets use short kebab-case keys) |
| 2. StylePicker Library Tab | Library tab in transformation flow; usage_count live | Lazy fetch adds ~1 RTT on first Library tab click; acceptable but visible on slow connections |
| 3. "Save as Style" CTA + Pages | Full authoring surfaces and global browse page | Prompt pre-fill derivation must NOT include the guardrail string (it's added at call time, not stored) |

**Prerequisites:** F-01 complete (done — `styles` table + migration pipeline working); **S-03 fully complete (all 3 phases done)** — `StylePicker`, `TransformationSession`, and `POST /api/transformations/start` must exist before S-04 implementation begins (they are S-03 Phase 3 and Phase 2 artifacts respectively)  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- Styles are read-only after publishing. If a user discovers a bug in their published prompt, they cannot fix it — they must create a new style. This is accepted for MVP.
- `usage_count` is incremented even if the transformation fails (it fires at job creation, not at job success). This is intentional — it counts intent-to-use as a popularity signal.
- The `is_reported` column approach requires the operator to actively check Supabase Studio. If the user base grows quickly, this needs escalation to an automated alert before the first public launch.

## Success Criteria (Summary)

- A user can create a public style and see it appear for other users in the Library tab within the same transformation session
- A style used in a transformation has its `usage_count` incremented exactly once per POST `/start` call
- A reported style has `is_reported = true` in DB; the Report button is idempotent and does not error on repeated clicks
