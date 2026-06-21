-- Add lower-bound guard on storage_used_bytes.
-- Prevents trigger bugs or service-role corrections from persisting a negative
-- counter, which would permanently disable the 100 MB quota gate for that user.
ALTER TABLE profiles
  ADD CONSTRAINT storage_nonneg CHECK (storage_used_bytes >= 0);
