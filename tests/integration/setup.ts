import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/types/database.generated";

// Phase 3 — real-Supabase test fixtures. DB tests import these helpers directly.
// Credentials mirror supabase/seed.sql. Two seeded, owner-distinct users let
// cross-account RLS/IDOR tests (Phases 4–5) assert real ownership separation.
//
// ponytail: a plain helper module, not a vitest `setupFiles` entry — a setupFile
// runs for EVERY test file (including the no-Supabase unit/guest tests), so a
// Supabase env guard there would wrongly fail them. DB tests opt in by importing.

export const TEST_USERS = {
  A: { id: "11111111-1111-1111-1111-111111111111", email: "usera@test.local", password: "testpass123" },
  B: { id: "22222222-2222-2222-2222-222222222222", email: "userb@test.local", password: "testpass123" },
} as const;

export type TestUser = keyof typeof TEST_USERS;

// Returns a Supabase client carrying user A's or B's authenticated session.
export async function signInAs(which: TestUser): Promise<SupabaseClient<Database>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY missing — is .env.test wired and Supabase running?");
  }
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { email, password } = TEST_USERS[which];
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`sign-in as user ${which} (${email}) failed: ${error.message}`);
  }
  return client;
}

// Timestamp + random suffix so per-test rows don't collide across re-runs / parallel workers.
export const uniqueId = (prefix = "t"): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
