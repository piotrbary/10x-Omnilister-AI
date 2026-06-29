import { describe, it, expect } from "vitest";
import { signInAs, uniqueId } from "./setup";

// Phase 3 smoke — proves the seed + env wiring: both seeded users sign in and
// the helper returns a session-bearing client. (3.1 + 3.2)

describe("Supabase test fixtures — seeded users sign in", () => {
  it.each(["A", "B"] as const)("signs in as user %s with a live session", async (which) => {
    const client = await signInAs(which);
    const { data, error } = await client.auth.getSession();
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    expect(data.session?.user.email).toBe(which === "A" ? "usera@test.local" : "userb@test.local");
  });

  it("generates unique ids", () => {
    expect(uniqueId("x")).not.toBe(uniqueId("x"));
  });
});
