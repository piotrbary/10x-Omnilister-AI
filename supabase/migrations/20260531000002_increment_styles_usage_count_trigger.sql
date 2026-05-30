-- Extend the guard to allow SECURITY DEFINER system calls via session var
CREATE OR REPLACE FUNCTION protect_styles_usage_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_count IS DISTINCT FROM OLD.usage_count
     AND current_setting('app.system_counter_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'usage_count is managed by the system and cannot be changed directly';
  END IF;
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER function: sets the bypass var, increments, clears it
CREATE OR REPLACE FUNCTION increment_style_usage_count(p_style_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.system_counter_update', 'true', true);
  UPDATE styles SET usage_count = usage_count + 1 WHERE id = p_style_id;
  PERFORM set_config('app.system_counter_update', 'false', true);
END;
$$;

-- Trigger function: fires AFTER INSERT on transformations; increments usage_count for DB styles
CREATE OR REPLACE FUNCTION on_transformation_created_increment_style_usage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.style_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM increment_style_usage_count(NEW.style_name::UUID);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_transformation_style_used
  AFTER INSERT ON transformations
  FOR EACH ROW EXECUTE FUNCTION on_transformation_created_increment_style_usage();
