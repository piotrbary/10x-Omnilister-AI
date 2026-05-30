---
change_id: object-and-photo-upload
roadmap_id: S-01
title: "Object creation and photo upload — browse gallery of uploaded photos"
status: implementing
created: 2026-05-31
updated: 2026-05-31
archived_at: null
---

## Notes

First product slice. Prerequisites: F-01 (db-schema-storage) — status: impl_reviewed.

Outcome: user can create an object (name only; version auto-set to 1), upload up to 10 photos per object via client-side direct-to-Supabase signed URLs, and browse a photo gallery. /dashboard redirects to /objects as the primary post-login landing page.

PRD refs: FR-001, FR-002, FR-003, FR-005, FR-006; US-01 (first part).
