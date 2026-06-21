-- Replace unreachable RETURN NULL with a loud failure.
-- The fallthrough was dead code (UPDATE and DELETE branches both return early),
-- but RAISE EXCEPTION makes accidental misuse (wrong event attachment) visible.
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
  RAISE EXCEPTION 'update_storage_on_transformation_status: unexpected TG_OP %', TG_OP;
END;
$$;
