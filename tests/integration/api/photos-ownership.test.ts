import { describe, it, expect, afterAll } from "vitest";
import type { APIContext } from "astro";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { POST as confirmUpload, GET as listPhotos } from "@/pages/api/objects/[objectId]/photos/index";
import { GET as getObject } from "@/pages/api/objects/[objectId]/index";
import { signInAs, uniqueId, TEST_USERS, type TestUser } from "../setup";

// Risk #4 — ownership / IDOR, against real RLS with two real users.
// (a) app-layer IDOR: A confirm-uploads a path under B's prefix → 422 (the fix)
// (b) cross-account read: A reads B's object → 404 (RLS denial, existence hidden)
// (c) photos-list parent gap: A lists photos of a foreign object → 200 {photos: []}
// No mocks: the auth cookie is produced by the real @supabase/ssr writer and
// replayed as the request Cookie header, so the handlers' queries run under the
// signed-in user's JWT (RLS applies).

// Build a real auth Cookie header for a seeded user via the actual ssr encoder.
async function cookieHeaderFor(which: TestUser): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("SUPABASE_URL/KEY missing — is .env.test wired?");
  const jar = new Map<string, string>();
  const writer = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => {
          if (value) jar.set(name, value);
          else jar.delete(name);
        });
      },
    },
  });
  const { email, password } = TEST_USERS[which];
  const { error } = await writer.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`writer sign-in as ${which} failed: ${error.message}`);
  if (jar.size === 0) throw new Error("no auth cookies captured from ssr writer");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

// Minimal AstroCookies stub — handlers read the session from the Cookie *header*;
// this only absorbs any write-back (none expected: token is fresh, no refresh).
const noopCookies = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined,
  has: () => false,
};

function makeContext(opts: { userId: string; objectId: string; cookieHeader: string; body?: unknown }): APIContext {
  const headers = new Headers({ Cookie: opts.cookieHeader });
  const init: RequestInit = { method: opts.body === undefined ? "GET" : "POST", headers };
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(opts.body);
  }
  const request = new Request(`http://localhost/api/objects/${opts.objectId}/photos`, init);
  return {
    request,
    params: { objectId: opts.objectId },
    cookies: noopCookies,
    locals: { user: { id: opts.userId } },
  } as unknown as APIContext;
}

// Track created objects for cleanup (photos cascade on object delete).
const created: { which: TestUser; objectId: string }[] = [];

async function createObject(which: TestUser): Promise<string> {
  const client = await signInAs(which);
  const { data, error } = await client
    .from("objects")
    .insert({ user_id: TEST_USERS[which].id, name: uniqueId("own-test") })
    .select("id")
    .single();
  if (error) throw new Error(`create object for ${which} failed: ${error.message}`);
  created.push({ which, objectId: data.id });
  return data.id;
}

afterAll(async () => {
  for (const { which, objectId } of created) {
    const client = await signInAs(which);
    await client.from("objects").delete().eq("id", objectId);
  }
});

describe("photos ownership / IDOR (Risk #4)", () => {
  it("(a) rejects a confirm-upload whose path is under another user's prefix — 422", async () => {
    const aObjectId = await createObject("A");
    const cookieHeader = await cookieHeaderFor("A");

    // Malicious: path points at B's storage prefix, not A's.
    const res = await confirmUpload(
      makeContext({
        userId: TEST_USERS.A.id,
        objectId: aObjectId,
        cookieHeader,
        body: {
          path: `${TEST_USERS.B.id}/${aObjectId}/hijack.png`,
          fileName: "hijack.png",
          mimeType: "image/png",
          fileSize: 123,
        },
      }),
    );

    expect(res.status).toBe(422);
  });

  it("(a') accepts a confirm-upload under the caller's own prefix — 201", async () => {
    const aObjectId = await createObject("A");
    const cookieHeader = await cookieHeaderFor("A");

    const res = await confirmUpload(
      makeContext({
        userId: TEST_USERS.A.id,
        objectId: aObjectId,
        cookieHeader,
        body: {
          path: `${TEST_USERS.A.id}/${aObjectId}/legit.png`,
          fileName: "legit.png",
          mimeType: "image/png",
          fileSize: 123,
        },
      }),
    );

    expect(res.status).toBe(201);
  });

  it("(b) cross-account read of B's object returns 404 (RLS denial, existence hidden)", async () => {
    const bObjectId = await createObject("B");
    const cookieHeader = await cookieHeaderFor("A");

    const res = await getObject(makeContext({ userId: TEST_USERS.A.id, objectId: bObjectId, cookieHeader }));

    expect(res.status).toBe(404);
  });

  it("(c) photos-list of a foreign object returns 200 {photos: []} (documents the parent-gap)", async () => {
    const bObjectId = await createObject("B");
    const cookieHeader = await cookieHeaderFor("A");

    const res = await listPhotos(makeContext({ userId: TEST_USERS.A.id, objectId: bObjectId, cookieHeader }));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { photos: unknown[] };
    expect(data.photos).toEqual([]);
  });
});
