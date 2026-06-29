import { describe, it, expect } from "vitest";
import type { APIContext, MiddlewareNext } from "astro";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { POST as signup } from "@/pages/api/auth/signup";
import { onRequest } from "@/middleware";
import { cookieHeaderFor, uniqueId } from "../setup";

// Risk #3 — registration / auth-gate, the honest in-code seams:
// (a) POST /api/auth/signup fires a real signUp and returns the confirm-email
//     contract; the user exists in Supabase afterward.
// (b) middleware redirects unauthenticated access to protected pages to signin,
//     and lets a session-bearing request through.
// Real confirm-link → session exchange is out of scope (no app callback route) —
// deferred to e2e. enable_confirmations=false locally makes the signed-up user
// immediately sign-in-able, which is how we prove existence.

const noopCookies = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined,
  has: () => false,
};

describe("registration gate (Risk #3) — signup", () => {
  it("fires signUp, returns {ok,confirmEmail}, and the user exists afterward", async () => {
    const email = `${uniqueId("signup")}@test.local`;
    const password = "testpass123";

    const request = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const res = await signup({ request, cookies: noopCookies } as unknown as APIContext);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, confirmEmail: true });

    // Proof the real user was created: it can sign in (confirmations off locally).
    // ponytail: no admin-delete cleanup — anon can't delete auth.users; unique email
    // per run + ephemeral local DB keep this safe. Admin cleanup needs a service-role
    // key not present in the test env.
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("SUPABASE_URL/KEY missing");
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(email);
  });
});

function mwContext(pathname: string, cookieHeader?: string): APIContext {
  const url = new URL(`http://localhost${pathname}`);
  const headers = new Headers();
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  return {
    request: new Request(url, { headers }),
    url,
    cookies: noopCookies,
    locals: {},
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  } as unknown as APIContext;
}

describe("registration gate (Risk #3) — middleware", () => {
  const passthrough = new Response("OK", { status: 200 });
  const next: MiddlewareNext = () => Promise.resolve(passthrough);

  it.each(["/dashboard", "/objects"])("redirects unauthenticated %s to /auth/signin", async (path) => {
    const res = (await onRequest(mwContext(path), next)) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/signin");
  });

  it("lets a session-bearing request through to a protected page", async () => {
    const cookieHeader = await cookieHeaderFor("A");
    const res = await onRequest(mwContext("/dashboard", cookieHeader), next);
    expect(res).toBe(passthrough);
  });
});
