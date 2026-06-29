-- Reconcile out-of-band remote migration 20260626135427_add_result_storage_path.
-- The column was added directly to prod and never committed; this mirrors that DDL
-- so fresh clones / local Supabase / CI get the column. Idempotent: a no-op on prod.
ALTER TABLE transformations ADD COLUMN IF NOT EXISTS result_storage_path TEXT;
