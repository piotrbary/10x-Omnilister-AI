-- Prevent authenticated users from manipulating styles.usage_count directly.
-- usage_count is a system-managed counter; only service-role or trigger-based
-- increments are legitimate.
CREATE OR REPLACE FUNCTION protect_styles_usage_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_count IS DISTINCT FROM OLD.usage_count THEN
    RAISE EXCEPTION 'usage_count is managed by the system and cannot be changed directly';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER styles_usage_count_guard
  BEFORE UPDATE ON styles
  FOR EACH ROW EXECUTE FUNCTION protect_styles_usage_count();
