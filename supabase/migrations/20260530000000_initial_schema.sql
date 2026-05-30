-- =============================================================================
-- F-01: Initial Schema — Omnilister AI
-- Phase 1: Core tables, functions, and triggers
-- Phase 2: Row Level Security policies
-- Phase 3: Indexes, Storage buckets, and seed data
-- =============================================================================

-- =============================================================================
-- PHASE 1: FUNCTIONS
-- =============================================================================

-- Shared trigger function: keeps updated_at current on any UPDATE
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Auto-create a profiles row when a new auth user registers.
-- SECURITY DEFINER + explicit search_path prevents schema injection and allows
-- the function (running in auth schema context) to INSERT into public.profiles.
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Increment / decrement profiles.storage_used_bytes on photo INSERT / DELETE.
-- SECURITY DEFINER required: the invoking user's RLS context would block the
-- UPDATE on profiles for another user_id without it.
CREATE OR REPLACE FUNCTION update_storage_on_photo_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET storage_used_bytes = storage_used_bytes + NEW.file_size_bytes
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET storage_used_bytes = storage_used_bytes - OLD.file_size_bytes
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Adjust profiles.storage_used_bytes when a transformation is saved or un-saved.
-- Fires on UPDATE (status change) and DELETE.
CREATE OR REPLACE FUNCTION update_storage_on_transformation_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'saved' AND OLD.status != 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes + COALESCE(NEW.result_file_size_bytes, 0)
      WHERE id = NEW.user_id;
    ELSIF OLD.status = 'saved' AND NEW.status != 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes - COALESCE(OLD.result_file_size_bytes, 0)
      WHERE id = OLD.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'saved' THEN
      UPDATE profiles SET storage_used_bytes =
        storage_used_bytes - COALESCE(OLD.result_file_size_bytes, 0)
      WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- =============================================================================
-- PHASE 1: TABLES
-- =============================================================================

-- profiles — one row per auth.users row; tracks per-account storage usage
-- CHECK constraint matches storageConfig.Max_Client_Repository = 100 MB
CREATE TABLE profiles (
  id                      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_used_bytes      BIGINT      NOT NULL DEFAULT 0
                          CONSTRAINT storage_limit CHECK (storage_used_bytes <= 104857600),
  ai_consent_confirmed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_user();

-- objects — a seller's listed item; category filled by S-02 after AI analysis
CREATE TABLE objects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  version    TEXT        NOT NULL DEFAULT '1',
  category   TEXT        CHECK (category IN ('car', 'real-estate', 'item')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER objects_updated_at
  BEFORE UPDATE ON objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- photos — metadata for every original photo in the original-photos bucket
CREATE TABLE photos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id       UUID        NOT NULL REFERENCES objects(id)    ON DELETE CASCADE,
  original_url    TEXT        NOT NULL,
  thumbnail_url   TEXT,
  file_size_bytes BIGINT      NOT NULL,
  mime_type       TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER photos_updated_at
  BEFORE UPDATE ON photos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_photo_storage_change
  AFTER INSERT OR DELETE ON photos
  FOR EACH ROW EXECUTE FUNCTION update_storage_on_photo_change();

-- quality_scores — append-only scoring history per photo (full history retained)
CREATE TABLE quality_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id        UUID        NOT NULL REFERENCES photos(id)     ON DELETE CASCADE,
  category        TEXT        NOT NULL CHECK (category IN ('car', 'real-estate', 'item')),
  sharpness       NUMERIC(4,2) NOT NULL,
  lighting        NUMERIC(4,2) NOT NULL,
  background      NUMERIC(4,2) NOT NULL,
  object_features NUMERIC(4,2) NOT NULL,
  damage_defects  NUMERIC(4,2) NOT NULL,
  labels          NUMERIC(4,2) NOT NULL,
  angle_coverage  NUMERIC(4,2) NOT NULL,
  sales_readiness NUMERIC(4,2) NOT NULL,
  overall_score   NUMERIC(4,2) NOT NULL,
  is_sales_ready  BOOLEAN      NOT NULL,
  scored_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- No updated_at: rows are immutable after insert
);

-- transformations — AI transformation job lifecycle (one row per photo per session)
-- result_file_size_bytes added vs. S-03 original contract (required by storage trigger)
CREATE TABLE transformations (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id              UUID        NOT NULL REFERENCES objects(id)    ON DELETE CASCADE,
  photo_id               UUID        NOT NULL REFERENCES photos(id)     ON DELETE CASCADE,
  style_name             TEXT        NOT NULL,
  prompt                 TEXT        NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','draft_ready','full_ready','failed','saved')),
  draft_url              TEXT,
  result_url             TEXT,
  result_file_size_bytes BIGINT,
  score_before           JSONB,
  score_after            JSONB,
  feedback               TEXT        CHECK (feedback IN ('improved','not_improved')),
  error_message          TEXT,
  retry_count            INTEGER     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER transformations_updated_at
  BEFORE UPDATE ON transformations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_transformation_storage_change
  AFTER UPDATE OR DELETE ON transformations
  FOR EACH ROW EXECUTE FUNCTION update_storage_on_transformation_status();

-- styles — global library; system presets have user_id = NULL, is_public = TRUE
CREATE TABLE styles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN ('car', 'real-estate', 'item')),
  prompt      TEXT        NOT NULL,
  description TEXT,
  is_public   BOOLEAN     NOT NULL DEFAULT FALSE,
  usage_count INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER styles_updated_at
  BEFORE UPDATE ON styles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- PHASE 2: ROW LEVEL SECURITY
-- =============================================================================

-- profiles: read-only for authenticated users
-- Writes are owned exclusively by SECURITY DEFINER triggers and service_role.
-- This prevents users from resetting storage_used_bytes via the REST API.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select" ON profiles
  FOR SELECT
  USING (id = auth.uid());

-- objects: owner-only
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objects owner" ON objects
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- photos: owner-only
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos owner" ON photos
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- quality_scores: owner-only
ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality_scores owner" ON quality_scores
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- transformations: owner-only
ALTER TABLE transformations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transformations owner" ON transformations
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- styles: public styles readable by all authenticated users; writes are owner-only.
-- INSERT policy requires user_id = auth.uid() (never NULL), so only migrations
-- can insert system presets (user_id IS NULL).
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "styles select" ON styles
  FOR SELECT
  USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "styles insert" ON styles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "styles update" ON styles
  FOR UPDATE
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "styles delete" ON styles
  FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- PHASE 3: INDEXES
-- =============================================================================

CREATE INDEX idx_objects_user                ON objects       (user_id,  created_at DESC);
CREATE INDEX idx_photos_object               ON photos        (object_id);
CREATE INDEX idx_photos_user                 ON photos        (user_id);
CREATE INDEX idx_quality_scores_photo_scored ON quality_scores(photo_id, scored_at DESC);
CREATE INDEX idx_transformations_object_status ON transformations(object_id, status);
CREATE INDEX idx_transformations_user_created  ON transformations(user_id,   created_at DESC);
CREATE INDEX idx_styles_category_public      ON styles        (category, is_public);

-- =============================================================================
-- PHASE 3: STORAGE BUCKETS
-- =============================================================================

-- file_size_limit = 10 MB matches storageConfig.maxSinglePhotoBytes
-- allowed_mime_types matches storageConfig.allowedPhotoMimeTypes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('original-photos',    'original-photos',    false, 10485760,
   ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('transformed-photos', 'transformed-photos', false, 10485760,
   ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: path convention {user_id}/{object_id}/...
-- storage.foldername(name)[1] returns the first path segment
CREATE POLICY "original-photos owner" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'original-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'original-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "transformed-photos owner" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'transformed-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'transformed-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================================================
-- PHASE 3: SEED DATA — 9 system preset styles
-- user_id = NULL (system-owned); is_public = TRUE (globally readable)
-- Prompts must match PRESET_STYLES in src/lib/transformation-styles.ts (S-03 Phase 1)
-- =============================================================================

INSERT INTO styles (user_id, name, category, prompt, description, is_public) VALUES
  -- Car presets
  (NULL, 'showroom',    'car',
   'Professional car dealership setting. Clean showroom floor, neutral background, even studio lighting. Do not add, remove, or alter any features of the car. Preserve all details, color, and markings exactly as shown.',
   'Dealership showroom look', true),

  (NULL, 'outdoor-clean', 'car',
   'Clean outdoor setting on a clear day. Neutral road or empty parking lot background. Natural daylight. Do not modify the car''s appearance, color, or features.',
   'Outdoor natural light', true),

  (NULL, 'white-studio', 'car',
   'Pure white seamless studio background. Professional photography lighting setup. No reflections on background. Do not alter any car features, color, or specifications.',
   'White studio background', true),

  -- Real-estate presets
  (NULL, 'bright-interior', 'real-estate',
   'Maximize natural light and brightness. Clean, uncluttered look. Sky through windows should be clear and bright. Do not add furniture or objects not present in the original.',
   'Bright natural light interior', true),

  (NULL, 'twilight-exterior', 'real-estate',
   'Warm golden-hour lighting. Well-lit façade. Clear sky. Do not add landscaping or features not present in the original.',
   'Twilight golden hour exterior', true),

  (NULL, 'clean-professional', 'real-estate',
   'Professional real estate photography look. Balanced exposure, crisp details. Do not add, remove, or alter any architectural features.',
   'Clean professional look', true),

  -- Item presets
  (NULL, 'white-background', 'item',
   'Pure white seamless background. Clean product photography with even lighting from multiple angles. Do not add any props or elements not present in the original.',
   'White product background', true),

  (NULL, 'neutral-background', 'item',
   'Soft gray or beige neutral background. Professional product photography. Even lighting, no harsh shadows. Do not add any items not in the original.',
   'Neutral gray background', true),

  (NULL, 'lifestyle-context', 'item',
   'Natural lifestyle photography context appropriate for the item. Keep the item as the focal point. Do not add any elements that misrepresent the product''s condition or features.',
   'Lifestyle context', true);
