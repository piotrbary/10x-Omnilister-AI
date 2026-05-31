---
change_id: ai-transformation-session
roadmap_id: S-03
title: "Sesja transformacji AI — podgląd przed/po i zapis"
status: implemented
created: 2026-05-30
updated: 2026-05-31
reviewed: 2026-05-30
prd_refs:
  - FR-010
  - FR-011
  - FR-012
prerequisites:
  - db-schema-storage       # F-01
  - object-and-photo-upload # S-01
  - ai-analysis-score       # S-02
---

## Summary

North-star slice (S-03). Implements the complete AI transformation flow: the user selects photos from an object, picks a preset style (or writes a custom prompt), triggers transformation via OpenAI gpt-image-1, monitors progress with a draft preview in ~5s and full result in ~60s, compares before/after with quality score delta, provides inline feedback, and saves selected transformed photos to the object's library.

## Dependencies

All three prerequisites must be completed before this change can be implemented:

| Change | What S-03 needs from it |
|--------|------------------------|
| `db-schema-storage` (F-01) | `transformations` table, `transformed-photos` bucket, RLS, storage usage tracking |
| `object-and-photo-upload` (S-01) | Object and photo data + API routes that return object/photo shapes |
| `ai-analysis-score` (S-02) | `quality_scores` per photo + a re-scorable scoring function for transformed images |

## Notes

- Change ID typo in original invocation (`ai-transformation-sesion`) — canonical ID is `ai-transformation-session` per roadmap.
- Planning ahead of prerequisites is intentional (lesson exercise). Implement only after F-01, S-01, S-02 are done.
