-- =============================================================================
-- Test fixtures — two confirmed, owner-distinct users (A and B)
-- Loaded by `supabase db reset` / `supabase start` (config.toml [db.seed]).
-- enable_confirmations = false (config.toml:209) → these are immediately
-- sign-in-able with no email round-trip.
--
-- Gotcha (project memory): manual auth.users inserts MUST give non-null values
-- to the token columns (confirmation_token, recovery_token, email_change*),
-- or sign-in crashes on a NULL scan. We pass '' for all of them.
--
-- Credentials are mirrored in tests/integration/setup.ts (TEST_USERS).
-- The handle_new_user trigger (20260530000000_initial_schema.sql:96) creates
-- the matching public.profiles row on insert.
-- =============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'usera@test.local', crypt('testpass123', gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'userb@test.local', crypt('testpass123', gen_salt('bf')),
   now(), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(),
   '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Email/password identity row (newer GoTrue requires this for sign-in).
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"usera@test.local"}',
   'email', '11111111-1111-1111-1111-111111111111', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"userb@test.local"}',
   'email', '22222222-2222-2222-2222-222222222222', now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;
