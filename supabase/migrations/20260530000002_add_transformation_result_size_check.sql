-- Prevent quota bypass: result_file_size_bytes must be non-null when a
-- transformation is saved, so the storage accounting trigger can never
-- be bypassed by a NULL file size.
ALTER TABLE transformations
  ADD CONSTRAINT result_size_required_when_saved
    CHECK (status != 'saved' OR result_file_size_bytes IS NOT NULL);
