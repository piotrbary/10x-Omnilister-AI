---
change_id: ai-analysis-score
roadmap_id: S-02
title: "Analiza AI — kategoria, cechy i quality score per wymiar"
status: implementing
created: 2026-05-31
updated: 2026-06-01
reviewed: 2026-05-31
prd_refs:
  - FR-004
  - FR-007
  - FR-008
  - FR-009
prerequisites:
  - db-schema-storage       # F-01 — impl_reviewed (done)
  - object-and-photo-upload # S-01 — not yet planned; Phases 3-4 blocked until S-01 is done
---

## Summary

S-02 adds AI-powered photo analysis to Omnilister AI. After uploading photos (S-01), the user
selects photos and clicks "Analyze" — the app calls GPT-4o Vision (via OpenRouter) to detect
the object category, extract free-text object features, and score each photo on 8 quality
dimensions in a single structured-output call. Scores are stored in the `quality_scores` table
and displayed in an analysis section on the object detail page.

Core deliverable is the `scorePhoto()` module function exported from `src/lib/quality-scoring.ts`,
which S-03's transformation background processor calls inline (no HTTP round-trip).

## Dependencies

| Change | What S-02 needs from it |
|--------|------------------------|
| `db-schema-storage` (F-01) | `quality_scores` table, `objects.category`, `photos` table with `original_url` |
| `object-and-photo-upload` (S-01) | Object and photo records in DB; API shapes returning photo lists with URLs |

Phases 1–2 (config, types, DB migration, scoring module) can be implemented before S-01 is done.
Phases 3–4 (API routes, UI) require S-01's object detail page and photo records to exist.
