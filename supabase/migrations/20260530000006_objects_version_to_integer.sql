-- Change objects.version from free-form TEXT to INTEGER for sequential versioning.
-- Default '1' cast to 1; existing rows are updated before type change.
ALTER TABLE objects
  ALTER COLUMN version DROP DEFAULT;

ALTER TABLE objects
  ALTER COLUMN version TYPE INTEGER USING version::INTEGER;

ALTER TABLE objects
  ALTER COLUMN version SET DEFAULT 1;
