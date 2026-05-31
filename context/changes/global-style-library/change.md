---
change_id: global-style-library
roadmap_id: S-04
title: "Globalna biblioteka stylów/promptów z przeglądaniem"
status: implemented
created: 2026-05-31
updated: 2026-05-31

prd_refs:
  - FR-013
prerequisites:
  - db-schema-storage       # F-01
  - ai-transformation-session # S-03
---

## Summary

Adds the global style library on top of the `styles` table created in F-01. Users can browse public styles, publish their own prompts to the library, and select library styles during a transformation session. Covers three surfaces: a Library tab in the S-03 StylePicker, a post-transformation "Save as Style" CTA inside TransformationSession, and a standalone `/styles` browse page + `/styles/new` creation form.

## Dependencies

| Change | What S-04 needs from it |
|--------|------------------------|
| `db-schema-storage` (F-01) | `styles` table with `is_public`, `usage_count`, RLS, 9 seeded presets |
| `ai-transformation-session` (S-03) | `StylePicker` component to extend, `TransformationSession` saving step to extend, `POST /transformations/start` to update for usage_count tracking |

## Notes

- The `styles` table is fully implemented (F-01 done). S-04 adds only one small migration: `is_reported` + `reporter_user_id` columns for the reactive moderation layer.
- Styles are read-only after publishing — no edit/delete in MVP.
- The no-distortion guardrail is already applied by `buildPrompt()` at call time; `styles.prompt` stores raw prompts without the guardrail.
