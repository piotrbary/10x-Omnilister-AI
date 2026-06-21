-- Remove draft concept from transformations:
-- draft_url column and draft_ready status are no longer used
-- (transformation is now synchronous — full result is returned directly)

-- Update any lingering draft_ready rows before changing the constraint
UPDATE transformations SET status = 'pending' WHERE status = 'draft_ready';

-- Drop draft_url column
ALTER TABLE transformations DROP COLUMN IF EXISTS draft_url;

-- Replace status CHECK constraint to remove draft_ready
ALTER TABLE transformations DROP CONSTRAINT IF EXISTS transformations_status_check;
ALTER TABLE transformations ADD CONSTRAINT transformations_status_check
  CHECK (status IN ('pending', 'full_ready', 'failed', 'saved'));
