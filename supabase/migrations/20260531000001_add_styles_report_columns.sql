ALTER TABLE styles
  ADD COLUMN is_reported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
