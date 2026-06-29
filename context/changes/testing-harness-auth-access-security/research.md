---
date: 2026-06-28T16:16:07+02:00
researcher: piotrbary
git_commit: c49259cf20c7c5a37b7c52aa9659b5210939c2c3
branch: UX_REDESIGN
repository: 10x_Omnilister_AI
topic: "Test-plan Phase 1 — Harness + auth & access security (Risks #3, #4, #5)"
tags: [research, codebase, auth, rls, idor, guest-transform, vitest, supabase]
status: complete
last_updated: 2026-06-28
last_updated_by: piotrbary
---

# Research: Test-plan Phase 1 — Harness + auth & access security

**Date**: 2026-06-28T16:16:07+02:00
**Researcher**: piotrbary
**Git Commit**: c49259cf20c7c5a37b7c52aa9659b5210939c2c3
**Branch**: UX_REDESIGN
**Repository**: 10x_Omnilister_AI

## Research Question

Ground test-plan §3 Phase 1 ("Harness + auth & access security") in the live code.
Phase covers three risks from `context/foundation/test-plan.md` §2:

- **Risk #3** — registration / email-confirm gate is broken or the confirmation email never fires.
- **Risk #4** — IDOR / RLS gap: one account reaches another's photos / objects / styles.
- **Risk #5** — guest-transform endpoint runs costly AI for unauthenticated callers.

Plus the bootstrap goal: a root `vitest.config` + Supabase test fixtures for integration tests.

## Summary

- **The harness is greenfield.** No root `vitest.config.*` exists; `npm test` is a bare
  `vitest run` that currently globs `agent-sdk-examples/**` and `.stryker-tmp/**` and **fails**.
  The new config's first job is scoping `include`/`exclude` and bridging the `astro:env/server`
  virtual module (which plain Vitest cannot resolve). Stryker reuses this same config.
- **Risk #3** is mostly *outside* the codebase. The confirmation email is an implicit side
  effect of `supabase.auth.signUp` (no `emailRedirectTo`, no callback route, no custom email
  code). The only in-code seam an integration test can assert is "`signUp` was called with the
  right args" and "middleware gates the protected pages." Real email delivery and the
  confirm→session exchange happen entirely on Supabase's hosted side.
- **Risk #4**: RLS is correctly enabled and owner-scoped on every user-owned table, and the
  app runs entirely on the **anon key** — so the DB is the hard backstop and single-resource
  cross-account reads correctly 404. But there is **one live application-layer IDOR**: the
  confirm-upload endpoint never validates the client-supplied storage `path`, and the
  `original-photos` bucket is **public**, so a foreign URL is both storable and viewable
  (this is exactly the unimplemented `lessons.md` rule). Plus three RLS-masked
  inconsistencies worth a test.
- **Risk #5**: `transformations/guest.ts` is unauthenticated **by design** (explicit
  `// ponytail` comment), the caller chooses the model, there is **no rate/size limit**, and
  the result is **ephemeral** (nothing persisted, no owner). It is also the *easiest* of the
  three to test — no Supabase client involved, only a `fetch` mock.

## Detailed Findings

### Risk #3 — Registration / email-confirm gate

**Signup entry.** UI is a native form POST: `src/components/auth/SignUpForm.tsx:66`
(`<form method="POST" action="/api/auth/signup">`, client-side validation only). The endpoint
`src/pages/api/auth/signup.ts:27` calls:

```ts
const { error } = await supabase.auth.signUp({ email, password });
```

**Critical**: `signUp` is called with `{ email, password }` only — **no `options`, no
`emailRedirectTo`** anywhere in `src/`. Responses: JSON `{ ok: true, confirmEmail: true }` /
form `302 → /auth/confirm-email` on success; `400` / `?error=` on failure; `503` if Supabase
unconfigured (`signup.ts:29-35`).

**Email-send boundary.** The confirmation email is sent **implicitly by Supabase's hosted Auth
service** as a side effect of `signUp` at `signup.ts:27`. There is no explicit send, no custom
SMTP/Resend/nodemailer code (negative search: `emailRedirectTo`, `verifyOtp`,
`exchangeCodeForSession`, `token_hash`, `callback` → **zero matches in `src/`**). The only
in-code assertable seam is the `signUp` call itself.

**Confirm → session.** **There is no confirmation-callback route.** `src/pages/auth/` holds
only `signin.astro`, `signup.astro`, `confirm-email.astro`. `confirm-email.astro` is a static
informational page that branches on `import.meta.env.DEV` (`confirm-email.astro:4`) — dev says
"you can now sign in", prod says "check your email" — and performs **no** verification. The
confirm link Supabase emails is handled Supabase-side; the app never exchanges a token.

**Login gate.** `src/pages/api/auth/signin.ts:27` calls `signInWithPassword`. It does **not**
distinguish confirmed vs unconfirmed — every failure (including "Email not confirmed") collapses
to a generic `400` / `?error=<message>`. Successful sign-in is the only thing that sets the
session cookie (via the SSR client `setAll` at `src/lib/supabase.ts:21-25`).

**Middleware gating.** `src/middleware.ts` (25 lines): `PROTECTED_ROUTES = ["/dashboard",
"/objects"]` (`:4`). On every request it calls `supabase.auth.getUser()` (validates against
Supabase, not `getSession()`) and sets `context.locals.user` (`:11-13`). If the path
`startsWith` a protected route and no user → **302 redirect to `/auth/signin`** (`:18-21`),
never a 401. **All `/api/*` routes are public at the middleware layer** — only the two page
prefixes are gated; API routes enforce their own auth.

**DB side.** `supabase/migrations/20260530000000_initial_schema.sql:96` has trigger
`on_auth_user_created AFTER INSERT ON auth.users → handle_new_user()` inserting into
`public.profiles`. `supabase.ts:6-8` mentions an app-layer self-heal upsert, but no code
actually performs it (comment only).

**What a test can / can't reach:**
- *Can*: assert `signUp({email,password})` fired and the route returns
  `{ok:true,confirmEmail:true}` / redirects to `/auth/confirm-email`; assert middleware 302s an
  unauthenticated `/dashboard` or `/objects` request and lets a session through.
- *Can't (cheaply)*: real email delivery; the confirm-link→session exchange (no app route);
  "unconfirmed user blocked at login" (depends on the live project's "Confirm email" toggle,
  not on code — needs a real/seeded Supabase, not a mock).

### Risk #4 — IDOR / RLS ownership

**Model.** Auth comes from `context.locals.user` (middleware); every API route 401s if null.
The Supabase client (`src/lib/supabase.ts:9-28`) uses the **anon key** (`.env` JWT decodes to
`role: anon`) — so **every query runs under RLS as the logged-in user**. No service-role /
RLS-bypassing path exists in any route. `.eq("user_id", …)` filters are defense-in-depth on top
of RLS.

**RLS layer** (`supabase/migrations/20260530000000_initial_schema.sql`): RLS **enabled on every
user-owned table**, owner-scoped:
- `objects` / `photos` / `quality_scores` / `transformations` (`:219-244`):
  `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`.
- `profiles` (`:213-216`): SELECT only `id = auth.uid()`; writes via `SECURITY DEFINER` triggers.
- `styles` (`:249-266`): public-readable (`is_public = true OR user_id = auth.uid()`),
  owner-writable.
- Storage RLS (`:296-316`): enforces `{user_id}/...` path on both buckets via
  `auth.uid()::text = (storage.foldername(name))[1]`.

**LIVE application-layer IDOR (the one real bug):**
`src/pages/api/objects/[objectId]/photos/index.ts` POST (confirm-upload) accepts `path` from the
body (`ConfirmUploadSchema:24-29`), verifies *object* ownership (`:94-99`), then
`getPublicUrl(path)` (`:105`) and inserts that URL as `original_url` (`:108-119`) — **with no
check that `path` starts with `${user.id}/${objectId}/`.** The companion `upload-url.ts:106`
builds the path safely server-side, but nothing forces the confirm step to reuse it. Combined
with migration `20260601000001_make_original_photos_public.sql:5-7` setting
`original-photos.public = true` (public bucket → URL served with no auth/RLS), user A can
register user B's storage URL in their own gallery. **This is the unimplemented `lessons.md`
rule "Validate client-provided storage paths before use."**

**Secondary, RLS-masked inconsistencies (not exploitable, but worth a test):**
- Photos *list* `GET /api/objects/[objectId]/photos` (`photos/index.ts:47-52`) has **no parent
  pre-check** → returns `200 {photos: []}` for a foreign/nonexistent objectId instead of 404
  (the `lessons.md` "empty results instead of 404" pattern).
- `photos/[photoId].ts` DELETE: SELECT filters `id+object_id+user_id` (`:23-25`) but DELETE
  drops `object_id` (`:36`) — still safe via `user_id`, violates "mirror all WHERE filters."
- Several child queries omit `.eq("user_id",…)` (`objects/[objectId]/index.ts:71-74`;
  `quality-scores/photo/[photoId].ts:37-44, 96-103`) — RLS is the backstop.

**Cross-account denial (representative read).** `GET /api/objects/[objectId]`
(`objects/[objectId]/index.ts:63-68`): `.eq("id",objectId).eq("user_id",user.id).single()` →
no row → **404 "Object not found"** (not 403, so existence isn't disclosed). Same shape for
`quality-scores` photo GET (`:33`), `transformations/[jobId]/result-url` (`:28`),
`save`/`feedback`. The only read that leaks emptiness rather than 404 is the photos list above.

### Risk #5 — Guest-transform endpoint

**Confirmed unauthenticated.** `src/pages/api/transformations/guest.ts` (`POST
/api/transformations/guest`). Handler `:26` never reads `context.locals.user` and never builds a
Supabase client. Explicit comment `:25`:
`// ponytail: no auth check — unauthenticated transforms. Add IP rate limiting if abuse occurs.`
Contrast the authed sibling `transformations/start.ts:20-21` (`if (!user) return 401`).
Middleware doesn't cover `/api/*`, so it runs straight through.

**Invokes the real paid pipeline.** `guest.ts:44`:
`generateFull(imageBytes, prompt, body.mimeType, [], model)` → `src/lib/openrouter-images.ts:141`
→ live OpenRouter `fetch` (`openrouter-images.ts:25, 84` to
`https://openrouter.ai/api/v1/chat/completions` with `Bearer OPENROUTER_API_KEY`).
**The caller controls the model** (`guest.ts:42`: `body.model ?? aiConfig.transformationModel`),
so a guest can request an expensive model from `config.ts:24-45`. Text/vision models cost **two**
paid calls (`enhancePrompt` + `generateImage`).

**No limits.** Only a required-field check (`guest.ts:36-38`). **No** rate limit, per-IP/session
cap, daily counter, captcha, feature flag, or size limit (the `storageConfig` 10 MB / MIME caps
at `config.ts:15-18` are never imported here). Body decoded unconditionally at `guest.ts:40`.

**Ephemeral data path.** `guest.ts:45` returns `{ result_base64 }` inline; nothing written to
DB or storage, no owner. (Contrast `start.ts:98-113` + `transformation-processor.ts:84-99` which
persist owner-scoped rows/objects.) The abuse vector is **pure compute/cost**, not a data write.

**Easiest to test.** No session, no cookies, no Supabase mock — just call the `POST` export with
a fabricated `context` whose `request.json()` returns the body, and stub global `fetch` (or mock
`@/lib/openrouter-images`) so OpenRouter isn't actually hit. `OPENROUTER_API_KEY` comes from
`astro:env/server` (`openrouter-images.ts:1`) so that virtual module still needs mocking.

### Harness / fixture state (bootstrap goal)

- **No root `vitest.config.*`.** `npm test` = bare `vitest run` (`package.json:11`), Vitest
  `^4.1.7` (`package.json:69`). A config-less run discovers **22 files / 110 tests and fails**
  — it globs `agent-sdk-examples/**`, `agent-sdk-examples/agent-sdk-examples/**`, and
  `.stryker-tmp/sandbox-*/**` (stale Stryker copy). The two **real** project tests pass.
  → New config must `include: src/**/*.{test,spec}.{ts,tsx}` and `exclude` `.stryker-tmp/**`,
  `agent-sdk-examples/**`, `packages/code-reviewer/**`, `node_modules/**`.
- **`astro:env/server` is the chief obstacle.** `src/lib/supabase.ts:3` and
  `src/lib/openrouter-images.ts:1` import secrets from the `astro:env/server` virtual module,
  which plain Vitest can't resolve. Two options: `getViteConfig` from `astro/config` (canonical
  bridge, nothing in repo uses it yet) **or** per-test `vi.mock("astro:env/server", …)` (the
  existing `quality-scoring.test.ts:2` precedent).
- **Established test convention**: co-located `src/lib/*.test.ts`; fetch mocked via
  `vi.spyOn(globalThis,"fetch")` + `vi.restoreAllMocks()`. Path alias `@/* → ./src/*`
  (`tsconfig.json:9-11`) currently resolves under Vitest but a root config should re-establish
  it (`getViteConfig` or `vite-tsconfig-paths`).
- **Zero Supabase fixtures.** No setup file, no `.env.test`, no `supabase/seed.sql` (despite
  `config.toml:60-65` referencing it), no service-role key. App `.env`/`.dev.vars` point at the
  **remote** project. Local Supabase **is configured** in `supabase/config.toml` (API :54321,
  auth `enable_confirmations = false` at `:209`) but isn't running/seeded.
- **No CI test gate.** `.github/workflows/ci.yml:19-21` runs `astro sync → lint → build` only.
- **Stryker shares the config.** `stryker.config.mjs` uses `testRunner: "vitest"`, mutates
  co-located `src/**/*.ts(x)`, and creates `.stryker-tmp/sandbox-*` (not gitignored). The new
  vitest config governs Stryker runs too — keep `src` co-location, don't relocate tests, and add
  `.stryker-tmp/` to `.gitignore`.

## Code References

- `src/pages/api/auth/signup.ts:27` — `signUp({email,password})`, no `emailRedirectTo` (Risk #3)
- `src/components/auth/SignUpForm.tsx:66` — native form POST to `/api/auth/signup`
- `src/pages/auth/confirm-email.astro:4` — static page, `import.meta.env.DEV` branch, no verify
- `src/pages/api/auth/signin.ts:27` — `signInWithPassword`, all failures → generic 400
- `src/middleware.ts:4,18-21` — gates only `/dashboard`,`/objects` via 302; `/api/*` open
- `src/lib/supabase.ts:9-28` — SSR client factory, anon key, `astro:env/server` import
- `supabase/migrations/20260530000000_initial_schema.sql:213-266,296-316` — RLS policies
- `supabase/migrations/20260601000001_make_original_photos_public.sql:5-7` — public bucket
- `src/pages/api/objects/[objectId]/photos/index.ts:94-119` — confirm-upload, **path unvalidated** (live IDOR)
- `src/pages/api/objects/[objectId]/photos/upload-url.ts:106` — safe server-built path
- `src/pages/api/objects/[objectId]/photos/index.ts:47-52` — photos list, no parent pre-check (200 [])
- `src/pages/api/objects/[objectId]/photos/[photoId].ts:23-25,36` — DELETE drops object_id
- `src/pages/api/objects/[objectId]/index.ts:63-68` — cross-account read → 404 (correct)
- `src/pages/api/transformations/guest.ts:25,26,36-45` — unauth, caller-chosen model, no limits, ephemeral
- `src/lib/openrouter-images.ts:25,84,141` — OpenRouter `fetch` boundary (mock point)
- `src/lib/config.ts:24-45,56,59` — model list, baseUrl, default model
- `package.json:11,69` — `test: vitest run`, vitest ^4.1.7 (no config)
- `src/lib/quality-scoring.test.ts:1-8` — existing `vi.mock("astro:env/server")` + fetch-spy precedent
- `stryker.config.mjs` — `testRunner: "vitest"`, shares the root vitest config
- `.github/workflows/ci.yml:19-21` — sync→lint→build, no test gate

## Architecture Insights

- **RLS is the real authorization backstop.** The app uses the anon key everywhere, so RLS
  enforces ownership even where app-layer `.eq("user_id")` filters are missing. Tests for Risk #4
  that run as a real authenticated user exercise RLS; tests that mock the Supabase client away
  test only the app-layer filters (and would miss the RLS enforcement). The one bug RLS does
  **not** catch is the public-bucket URL path (the live IDOR) — that needs an app-layer assertion.
- **Two distinct test seams per risk.** Risk #5 (guest) needs no Supabase at all → pure
  fetch-mock unit-ish integration test. Risk #4 cross-account denial genuinely needs **two real
  users** against a real/seeded Supabase to exercise RLS. Risk #3's only honest in-code assertion
  is the `signUp` call + middleware gating; the rest lives on Supabase's side.
- **The `astro:env/server` decision is load-bearing for the whole phase.** Mock-per-test is
  cheap and matches precedent but won't give a real Supabase session; `getViteConfig` + a real
  test Supabase is needed for the genuine cross-account (Risk #4) test. This is the first
  decision the plan must make.

## Historical Context (from prior changes)

`context/foundation/lessons.md` already encodes the team's IDOR priors — this research confirms
which currently hold:
- "Validate client-provided storage paths before use" (lessons.md:13-17) — **NOT implemented**
  at `photos/index.ts:94-119` (the live IDOR above).
- "Always pre-check object ownership before querying child resources" (lessons.md:40-45) —
  **gap** at photos-list GET.
- "Mirror all WHERE filters from SELECT to DELETE/UPDATE" (lessons.md:34-38) — **partial**
  (DELETE drops object_id).
- "Apply user_id filter on every query" (lessons.md:54-59) — **not uniform** (RLS-masked).

## Related Research

None yet — this is the first research artifact under `context/changes/`. Phases 2–4 of the
test-plan rollout (`context/foundation/test-plan.md` §3) will produce their own.

## Open Questions

1. **Fixture strategy (must resolve before planning Risk #4):** local `supabase start` + a
   `seed.sql` with two test users, or the remote `testuser@demo.com` account + a second seeded
   user? Local is deterministic and CI-friendly but needs seeding work; remote reuses the
   existing account but is non-deterministic and shared.
2. **`astro:env/server` bridge:** `getViteConfig` (real env, supports a real Supabase session)
   vs. per-test `vi.mock` (cheap, no real session). Likely both — mock for Risk #5, real for #4.
3. **Risk #3 scope:** given the email send and confirm→session are entirely Supabase-hosted, is
   the in-code assertion (`signUp` fired + middleware gates) enough for Phase 1, deferring the
   true "unconfirmed user can't log in" check to the Phase 4 e2e against a real environment?
4. **Should the live IDOR (path validation) be fixed in this phase or only covered by a failing
   test that documents it?** The phase is scoped to *testing*, but a red test on a known live
   bug is a deliberate choice the plan should make explicit.
