-- Make create_profile_for_user idempotent.
-- ON CONFLICT DO NOTHING ensures the trigger survives re-runs and guards
-- against Supabase auth schema permission changes silently breaking signups.
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
