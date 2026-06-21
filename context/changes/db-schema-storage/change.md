---
change_id: db-schema-storage
roadmap_id: F-01
title: "DB schema and Supabase Storage buckets — foundation for all product slices"
status: impl_reviewed
created: 2026-05-30
updated: 2026-05-30
archived_at: null
---

## Notes

Foundation change. Unblocks S-01, S-02, S-03, S-04. Must be implemented and verified before any product slice begins. Single migration file; three logical phases: core schema → RLS → indexes + buckets + seeds.
