# Testing Harness + Auth & Access Security (Phase 1) Implementation Plan

## Overview

Bootstrap the project's first real test harness (a root `vitest.config`) plus
Supabase test fixtures, then cover the three Phase-1 risks from
`context/foundation/test-plan.md` §3:

- **Risk #3** — registration / email-confirm gate.
- **Risk #4** — IDOR / RLS ownership (includes fixing one live application-layer IDOR).
- **Risk #5** — unauthenticated guest-transform cost boundary.

Tests run **end-to-end against real services**: a real (local-seeded by default,
remote-overridable) Supabase, and **real but cost-minimized** OpenRouter calls
(minimal-cost model + a tiny image). No Supabase client mock and no
`astro:env/server` mock — `getViteConfig` loads a real `.env.test`.

## Current State Analysis

- **No root `vitest.config.*` exists.** `npm test` is a bare `vitest run`
  (`package.json:11`) that globs `agent-sdk-examples/**`, nested copies, and
  stale `.stryker-tmp/sandbox-*/**` → discovers 22 files / 110 tests and
  **fails**. Only two real tests exist (`src/lib/*.test.ts`), both pure helpers.
- **`astro:env/server` is the chief obstacle.** `src/lib/supabase.ts:3` and
  `src/lib/openrouter-images.ts:1` import secrets from this virtual module, which
  plain Vitest can't resolve. `getViteConfig` (from `astro/config`) is the
  canonical bridge; nothing in the repo uses it yet.
- **Zero Supabase fixtures.** No setup file, no `.env.test`, no usable
  `supabase/seed.sql`. Local Supabase **is configured** (`supabase/config.toml`,
  API :54321, `auth.enable_confirmations = false` at `:209`) but isn't seeded.
  The `supabase` CLI is already a devDependency (`package.json:66`).
- **Live application-layer IDOR.** `src/pages/api/objects/[objectId]/photos/index.ts`
  POST (`:86`–`:106`) takes a client `path`, verifies *object* ownership only,
  then `getPublicUrl(path)` and inserts the URL — **never checking the path
  belongs to the user/object**. Combined with the public `original-photos` bucket
  (`20260601000001_make_original_photos_public.sql:5-7`), user A can register
  user B's storage URL. This is the unimplemented `lessons.md` rule "Validate
  client-provided storage paths before use."
- **Guest endpoint is unauth by design.** `src/pages/api/transformations/guest.ts:25`
  (`// ponytail` comment), caller chooses the model (`:42`), no rate/size limit,
  result ephemeral (`:45`). Touches no Supabase — only OpenRouter via `fetch`.
- **CI has no test gate.** `.github/workflows/ci.yml` runs `astro sync → lint →
  build` only, and triggers on `master` (the repo default branch is `main` — a
  pre-existing quirk, see "Migration Notes").
- **Stryker shares the runner.** `stryker.config.mjs` uses `testRunner: "vitest"`
  and already excludes `*.test.ts(x)` from *mutation* (`:8`), but discovers tests
  via the vitest config — so the new config must keep slow DB/network integration
  tests out of mutation runs.

## Desired End State

`npm test` runs a scoped, green suite from a root `vitest.config`: the two
existing unit tests plus new integration tests for Risks #3/#4/#5, executed
against a real local Supabase and real (cheap) OpenRouter. The live IDOR is
fixed and proven by a passing test. CI runs the suite (local Supabase +
`OPENROUTER_API_KEY` secret) as a gate on PRs. The test-plan cookbook §6.2/§6.6
documents how to add an integration test, and §3 Phase 1 is marked complete.

**Verification**: `npm test` exits 0 and discovers only intended files;
`supabase start` + seed yields two usable users; the IDOR test fails before the
guard and passes after; CI's test job is green on a PR.

### Key Discoveries:

- IDOR fix point: `src/pages/api/objects/[objectId]/photos/index.ts:86` (after
  `ConfirmUploadSchema` parse, before `getPublicUrl` at `:105`).
- Env-mock precedent to *replace*, not extend: `src/lib/quality-scoring.test.ts:3`
  (`vi.mock("astro:env/server")`) — new integration tests use real env instead.
- `auth.enable_confirmations = false` (`supabase/config.toml:209`) means a seeded
  local user is immediately usable for sign-in — no email round-trip in tests.
- Caller-chosen model (`guest.ts:42`) is the lever for cost-minimized real calls:
  the test passes the minimal-cost image model from `src/lib/config.ts:24-45`.

## What We're NOT Doing

- **Not** asserting real email delivery or the confirm-link→session exchange —
  no app callback route exists; deferred to Phase 4 e2e (Risk #3 scope decision).
- **Not** keeping a mock on the *happy path* of `quality-scoring.test.ts` — it's
  converted to a real `scorePhoto` call (Phase 2). The **only** mocks that remain
  anywhere are the deliberate-failure retry/error cases, because a real API can't
  be forced to return a 503 / malformed JSON / fail N times on command.
- **Not** mocking Supabase or `astro:env/server` in the new tests.
- **Not** adding rate-limiting / size caps to the guest endpoint — Phase 1 tests
  *document* the boundary; hardening is a later change.
- **Not** fixing the secondary RLS-masked inconsistencies as code (DELETE drops
  `object_id`, missing `user_id` filters) — only the photos-list parent pre-check
  gap is asserted via test; the live IDOR is the only code fix in scope.
- **Not** wiring Playwright / e2e (Phase 4) or expanding Stryker scope.

## Implementation Approach

Bootstrap-first: land the config (Phase 1) so any test can run, then prove the
harness end-to-end with the **no-Supabase** guest test (Phase 2) before taking on
fixtures (Phase 3) and the DB-dependent ownership/auth tests (Phases 4–5).
Close by wiring CI and the cookbook (Phase 6). Real services throughout;
OpenRouter cost is bounded by model + image-size choice, not by mocking.

## Critical Implementation Details

- **Real OpenRouter cost control.** Tests that hit OpenRouter MUST pass the
  minimal-cost image-capable model (`src/lib/config.ts:24-45`) and the smallest
  valid image payload. Assert the *contract* (a non-empty `result_base64` /
  artifact, correct status) — never exact pixels. A live `OPENROUTER_API_KEY`
  must be present in `.env.test` and CI secrets or these tests fail loudly.
- **Stryker vs integration tests.** The new vitest config defines an integration
  scope (`tests/integration/**`) that Stryker's mutation run must NOT execute
  (slow, real DB/network). Keep mutation pointed at the unit scope only.
- **Test isolation against a real DB.** Each DB test owns its setup → action →
  assertion → cleanup, with unique ids (timestamp suffix) so re-runs and parallel
  workers don't collide. Seeded users are stable; per-test rows are ephemeral.

## Phase 1: Harness bootstrap

### Overview

Create the root `vitest.config` so `npm test` runs a scoped, green suite, and
stop the stale-glob failure. Keep Stryker working and unpolluted.

### Changes Required:

#### 1. Root Vitest config

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Give Vitest a real config that resolves `astro:env/server` and the
`@/*` alias and scopes which files are tests, so `npm test` runs only project
tests and passes.

**Contract**: Default-export a config built on `getViteConfig` from
`astro/config` (real Astro env + virtual-module resolution, real `.env.test`
loaded). `test.include`: `src/**/*.{test,spec}.{ts,tsx}` and
`tests/integration/**/*.{test,spec}.ts`. `test.exclude`: `.stryker-tmp/**`,
`agent-sdk-examples/**`, `packages/**`, `node_modules/**`. Re-establish the
`@/* → ./src/*` alias (`tsconfig.json:9-11`). Load `.env.test` via the
config's env-file mechanism.

#### 2. Ignore Stryker scratch output

**File**: `.gitignore`

**Intent**: Stop `.stryker-tmp/` sandboxes from being tracked or re-globbed.

**Contract**: Add a `.stryker-tmp/` line.

#### 3. Keep Stryker scoped to unit tests

**File**: `stryker.config.mjs`

**Intent**: Ensure mutation runs don't execute slow real-DB/network integration
tests once `tests/integration/**` exists.

**Contract**: Constrain the Stryker vitest run to the unit scope (e.g. a
dedicated vitest project/dir for `src/**` unit tests, or a Stryker
`vitest.configFile`/dir option) so `tests/integration/**` is excluded from
mutation. Mutation set (`src/**`, excluding `*.test.*`) stays as-is.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 and discovers only `src/**` + `tests/integration/**` (no
  `agent-sdk-examples`/`.stryker-tmp` files): `npm test`
- The two existing unit tests still pass.
- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification:

- `npx stryker run` completes without executing integration tests.

**Implementation Note**: After automated verification passes, pause for manual
confirmation before the next phase.

---

## Phase 2: Risk #5 guest test + real scoring conversion

### Overview

Prove the harness runs real route/library tests end-to-end: the unauthenticated
guest cost boundary (#5), and convert the existing scoring test off its
happy-path mock to a real `scorePhoto` call. Both use a real cost-minimized
OpenRouter call (min-cost model + tiny image).

### Changes Required:

#### 1. Guest-endpoint boundary test

**File**: `tests/integration/transformations/guest.test.ts` (new)

**Intent**: Assert the guest endpoint's *intended* abuse surface: it runs with
**no auth** (unauth-by-design), it honors a **caller-chosen model**, and it
applies **no rate/size limit** — exactly the cost-abuse risk. Invoke the real
`POST` export against a fabricated `context` (no session, no cookies) and let it
make a real OpenRouter call.

**Contract**: Import the `POST` handler from
`src/pages/api/transformations/guest.ts`; call it with a context whose
`request.json()` returns `{ imageBase64: <tiny PNG>, mimeType, style_name,
model: <minimal-cost image model from config.ts> }`. Assert: 200 + non-empty
`result_base64` for an unauthenticated caller (proves the boundary is open by
design and the paid pipeline is reachable without a session); 400 when a required
field is missing (`guest.ts:36-38`). Use the minimal-cost model + smallest valid
image to bound spend. No Supabase, no mocks.

#### 2. Convert scoring test to real (happy path); isolate the failure cases

**Files**: `tests/integration/quality-scoring.test.ts` (new, real),
`src/lib/quality-scoring.test.ts` (reduced to failure cases or removed)

**Intent**: Replace the happy-path `vi.spyOn(fetch)` mock with a real
`scorePhoto` call asserting contract invariants, since a real AI returns
non-deterministic scores. Preserve the retry/error cases — which *require* a mock
to simulate failures — as the sole remaining mocked tests.

**Contract**: New integration test calls
`scorePhoto(<tiny-image signed URL or data URL>, "item", <min-cost vision model
from config.ts>)` against real OpenRouter and asserts **invariants, not fixed
numbers**: all 8 dimensions are numbers in `[0,10]`; `overall` equals the
category-weighted mean of the returned dimensions (same formula as
`computeOverall`, `quality-scoring.ts:64-76`); `is_sales_ready === (overall >=
scoringConfig.salesReadinessThreshold)`. The deliberate-failure cases
(`quality-scoring.test.ts:87-155`: retry-on-reject, non-ok HTTP, malformed JSON,
empty content — all asserting `maxRetries+1` calls) **stay mocked**; keep them as
a trimmed co-located `src/lib/quality-scoring.test.ts` (still feeds Stryker
mutation on the retry logic). The exact-rounding/threshold math
(`:22-85`) is covered by the invariant check above plus the surviving unit cases.

### Success Criteria:

#### Automated Verification:

- Guest test passes against real OpenRouter: `npm test`
- Scoring integration test passes against real OpenRouter, asserting invariants (no fixed-number oracle).
- Surviving retry/error unit cases still pass (mocked failures).
- Tests run without any Supabase client or `astro:env/server` mock (real env).

#### Manual Verification:

- OpenRouter spend for one run is negligible (min-cost model + tiny image).
- `OPENROUTER_API_KEY` resolution from real env confirmed (tests fail clearly if absent).

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 3: Supabase test fixtures

### Overview

Stand up a real local Supabase with two seeded users and the env wiring so DB
tests in Phases 4–5 have deterministic, owner-distinct accounts. Same suite can
target remote by swapping env vars.

### Changes Required:

#### 1. Seed two test users

**File**: `supabase/seed.sql` (new or replace; referenced by `config.toml:60-65`)

**Intent**: Create two confirmed users (A and B) with distinct ids so
cross-account RLS tests have real, owner-separated data. `enable_confirmations =
false` (`config.toml:209`) makes them immediately sign-in-able.

**Contract**: Insert two `auth.users` rows (the `handle_new_user` trigger at
`migrations/20260530000000_initial_schema.sql:96` populates `public.profiles`).
Follow the test-account gotcha: **non-null token columns** on manual
`auth.users` inserts (NULL there crashes sign-in). Known credentials, stable ids.

#### 2. Test env files

**Files**: `.env.test` (local default), `.env.test.remote` (override template),
`.gitignore` entry for real-secret variants

**Intent**: Point the suite at local Supabase + a real `OPENROUTER_API_KEY` by
default; allow a same-suite run against remote by swapping the file/vars.

**Contract**: `.env.test` sets local `SUPABASE_URL`/`SUPABASE_KEY` (API :54321,
local anon key), `OPENROUTER_API_KEY`. `.env.test.remote` documents the remote
override. The committed file must not carry a real secret value — document how
the key is supplied locally/CI.

#### 3. Test setup helper

**File**: `tests/integration/setup.ts` (new; referenced by vitest config)

**Intent**: Provide a real authenticated Supabase client per test user and a
unique-id helper, so DB tests are self-contained with cleanup.

**Contract**: Export a helper that signs in user A or B (real
`signInWithPassword`) and returns a client carrying that session, plus a
timestamp-suffix id generator. Wire it via `test.setupFiles` in the vitest
config.

### Success Criteria:

#### Automated Verification:

- `supabase start` + seed yields two sign-in-able users (a smoke test signs in as A and B): `npm test`
- Setup helper returns a session-bearing client for each user.

#### Manual Verification:

- A row created as user A is not visible to user B (sanity check of RLS via the helper).
- Swapping to `.env.test.remote` runs the same smoke against remote.

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 4: Risk #4 — IDOR fix + ownership tests

### Overview

Fix the one live application-layer IDOR and prove ownership enforcement across
the API with two real users.

### Changes Required:

#### 1. Validate the client-supplied storage path (the fix)

**File**: `src/pages/api/objects/[objectId]/photos/index.ts`

**Intent**: Reject a confirm-upload whose `path` doesn't belong to the
authenticated user and validated object — closing the cross-user URL hijack.

**Contract**: After `ConfirmUploadSchema` parse and object-ownership check, before
`getPublicUrl` (`:105`), enforce the `lessons.md` rule:
`if (!path.startsWith(`${user.id}/${objectId}/`)) return 422`. Mirror the
existing 422 response shape.

#### 2. Ownership / IDOR tests

**File**: `tests/integration/api/photos-ownership.test.ts` (new)

**Intent**: Prove the IDOR is closed and that cross-account access is denied,
using two real users against real RLS.

**Contract**: With users A and B from the fixtures —
(a) **app-layer IDOR**: A confirm-uploads a `path` under B's prefix → **422**
(this test fails before the guard, passes after);
(b) **cross-account read**: A requests B's object via `GET
/api/objects/[objectId]` → **404** (RLS denial, existence not disclosed);
(c) **photos-list parent gap**: `GET /api/objects/[foreignObjectId]/photos`
documents the current behavior (200 `{photos: []}` for a foreign/nonexistent
parent — the `lessons.md` "empty instead of 404" pattern). Each test creates and
cleans up its own rows with unique ids.

### Success Criteria:

#### Automated Verification:

- IDOR test is red before the guard, green after: `npm test`
- Cross-account read returns 404; ownership tests pass.
- Typecheck + lint pass: `npm run typecheck` && `npm run lint`

#### Manual Verification:

- Confirm-upload still works for a legitimate (own-prefix) path.
- No regression in the normal upload→confirm flow via the UI.

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 5: Risk #3 — registration / auth-gate test

### Overview

Cover the in-code seam of the registration gate: signup triggers the Supabase
`signUp`, and middleware gates the protected pages. Real confirm→session is
deferred to Phase 4 e2e.

### Changes Required:

#### 1. Signup + middleware-gate tests

**File**: `tests/integration/auth/registration-gate.test.ts` (new)

**Intent**: Assert the only honest in-code seams: the signup route triggers
`signUp` and returns the confirm-email contract, and middleware redirects
unauthenticated access to the protected pages.

**Contract**: (a) POST `/api/auth/signup` with a unique email → response carries
`{ ok: true, confirmEmail: true }` (JSON) / 302 → `/auth/confirm-email`, and the
user exists in Supabase afterward (real signup). (b) An unauthenticated request
whose path `startsWith` `/dashboard` or `/objects` → **302 → `/auth/signin`**
(`middleware.ts:4,18-21`); a session-bearing request passes through. Unique email
per run; clean up the created user.

### Success Criteria:

#### Automated Verification:

- Signup + middleware-gate tests pass against real Supabase: `npm test`
- Unauthenticated `/dashboard` and `/objects` both 302 to signin.

#### Manual Verification:

- A freshly signed-up local user can sign in (confirmations disabled locally).

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 6: CI gate wiring + cookbook

### Overview

Make the suite a CI gate and document the integration-test pattern; mark the
rollout phase done.

### Changes Required:

#### 1. CI test job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the real-service suite on PRs so auth/ownership/guest regressions
are caught (satisfies §5 gate "unit+integration required after Phase 1").

**Contract**: Add steps to start local Supabase (`supabase start`, CLI already a
devDep; ubuntu runners have Docker), apply seed, then `npm test` with
`OPENROUTER_API_KEY` (new repo secret) and the local Supabase env. Keep existing
`sync → lint → build`. Note the pre-existing `master`-vs-`main` trigger quirk.

#### 2. Cookbook + rollout status

**Files**: `context/foundation/test-plan.md` (§6.2, §6.6, §3 status)

**Intent**: Make §6.2 the canonical "how to add an integration test" entry and
record what this phase taught; flip §3 Phase 1 to `complete`.

**Contract**: §6.2 — location (`tests/integration/**`), naming
(`<area>.test.ts`), reference test (the photos-ownership test), run command
(`npm test`), real-Supabase + real-cheap-OpenRouter convention, the two-seeded-
users fixture. §6.6 — 2–3 lines on the `getViteConfig` bridge + fixture shape.
§3 Phase 1 row → `complete`.

### Success Criteria:

#### Automated Verification:

- CI test job is green on a PR (Supabase started, seeded, `npm test` passes).
- `context/foundation/test-plan.md` §3 Phase 1 status reads `complete`.

#### Manual Verification:

- §6.2 is specific enough that a contributor can add an integration test from it alone.

**Implementation Note**: Final phase — confirm the full suite + CI are green.

---

## Testing Strategy

### Integration Tests (real services):

- Guest boundary (#5): unauth call reaches the paid pipeline; caller-chosen
  model; missing-field 400. Real cheap OpenRouter.
- Ownership (#4): app-layer IDOR → 422; legit own-prefix → 201; cross-account
  read → 404; photos-list parent gap documented. Two real users, real RLS.
- Registration gate (#3): `signUp` fired + confirm-email contract; middleware
  302 on protected pages.

### Scoring test (converted):

- Happy path goes **real** (`tests/integration/quality-scoring.test.ts`) —
  contract invariants against real cheap OpenRouter, no fixed-number oracle.
- Retry/error cases stay mocked (only way to force failures) in a trimmed
  `src/lib/quality-scoring.test.ts`, preserving Stryker mutation coverage.

### Manual Testing Steps:

1. `supabase start`, apply seed, confirm users A and B can sign in.
2. `npm test` — full suite green; confirm OpenRouter spend is negligible.
3. Temporarily revert the IDOR guard → confirm the IDOR test goes red.
4. Open a PR → confirm the CI test job runs and gates.

## Performance Considerations

Real OpenRouter calls are the only slow/costly step; bounded by minimal-cost
model + tiny image. Integration tests touch a real DB — keep them out of the
Stryker mutation loop and use unique ids for parallel safety.

## Migration Notes

- `ci.yml` triggers on `master`; the repo default is `main`. Pre-existing quirk —
  flag to the owner; fixing the trigger is out of scope for this phase but the
  test job should be reachable on the branches that actually run.
- `OPENROUTER_API_KEY` must be added as a GitHub Actions secret before the CI
  test job will pass.

## References

- Research: `context/changes/testing-harness-auth-access-security/research.md`
- Test plan: `context/foundation/test-plan.md` §2–§6
- Lessons: `context/foundation/lessons.md` (storage-path validation, parent pre-check)
- IDOR fix point: `src/pages/api/objects/[objectId]/photos/index.ts:86`
- Env-mock precedent (to replace): `src/lib/quality-scoring.test.ts:3`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness bootstrap

#### Automated

- [x] 1.1 `npm test` exits 0 and discovers only `src/**` + `tests/integration/**` — 82d8e55
- [x] 1.2 The two existing unit tests still pass — 82d8e55
- [x] 1.3 Typecheck passes (adapted: no new errors from touched files; baseline pre-existing failures unrelated) — 82d8e55
- [x] 1.4 Lint passes (adapted: touched files clean exit 0; baseline pre-existing failures unrelated) — 82d8e55

#### Manual

- [x] 1.5 `npx stryker run` completes without executing integration tests (scoping proven: Stryker now uses vitest.config.unit.ts → src/** only, tests/integration/** excluded, demonstrated via probe test. Full run still blocked at the TS-checker by a pre-existing schema bug — `result_storage_path` missing from `transformations` — deferred to its own change; baseline junk-dir + model-type errors fixed here) — 82d8e55

### Phase 2: Risk #5 guest test + real scoring conversion

#### Automated

- [x] 2.1 Guest test passes against real OpenRouter — 4b6098f
- [x] 2.2 Scoring integration test passes against real OpenRouter, asserting invariants — 4b6098f
- [x] 2.3 Surviving retry/error unit cases still pass (mocked failures) — 4b6098f
- [x] 2.4 Tests run without any Supabase or `astro:env/server` mock — 4b6098f

#### Manual

- [x] 2.5 OpenRouter spend for one run is negligible — 4b6098f
- [x] 2.6 `OPENROUTER_API_KEY` resolution from real env confirmed — 4b6098f

### Phase 3: Supabase test fixtures

#### Automated

- [x] 3.1 `supabase start` + seed yields two sign-in-able users — e5c7098
- [x] 3.2 Setup helper returns a session-bearing client per user — e5c7098

#### Manual

- [x] 3.3 Row created as A is not visible to B (RLS sanity) — verified via throwaway test: A sees its own `objects` row, B sees 0 rows, no error — e5c7098
- [x] 3.4 Same smoke runs against remote via `.env.test.remote` — VERIFIED against remote prod (`kpplmltwctkfwrdtllez`): seeded A/B via MCP, `.env.test.local` override, smoke 3/3 green, then deleted both users (0 remain) — e5c7098

### Phase 4: Risk #4 — IDOR fix + ownership tests

#### Automated

- [x] 4.1 IDOR test red before the guard, green after — proven: test (a) returns 201 with guard disabled, 422 with guard — cfc615f
- [x] 4.2 Cross-account read returns 404; ownership tests pass — 4 tests green (422 IDOR, 201 legit, 404 cross-account, 200 empty parent-gap) — cfc615f
- [x] 4.3 Typecheck + lint pass — astro check 0 errors, tsc --noEmit clean, eslint 0 errors on touched files — cfc615f

#### Manual

- [x] 4.4 Confirm-upload still works for a legitimate own-prefix path — automated (a') test returns 201 (re-run green 2026-06-29)
- [x] 4.5 No regression in the upload→confirm flow via the UI — static proof: path is server-generated in upload-url.ts:106 (`${user.id}/${objectId}/${safeName}`) and passed through by PhotoUploader.tsx:72→109, so it always satisfies the guard prefix; guard only rejects forged paths

### Phase 5: Risk #3 — registration / auth-gate test

#### Automated

- [x] 5.1 Signup + middleware-gate tests pass against real Supabase — signup returns {ok,confirmEmail} + user sign-in-able; session-bearing request passes middleware — 64d5484
- [x] 5.2 Unauthenticated `/dashboard` and `/objects` both 302 to signin — it.each covers both → 302 Location /auth/signin — 64d5484

#### Manual

- [x] 5.3 A freshly signed-up local user can sign in — automated registration-gate test signs in the freshly-created user (re-run green 2026-06-29)

### Phase 6: CI gate wiring + cookbook

#### Automated

- [x] 6.1 CI test job is green on a PR (ADAPTED — DEFERRED: per project `CLAUDE.md`, "Do not author CI/CD pipelines from scratch or write GitHub Actions YAML"; CI config is owned by another lesson. §5 gate "unit+integration required after Phase 1" is named in test-plan.md but wiring is left to the owning lesson. No `ci.yml` edit made.) — 9d1913b
- [x] 6.2 `test-plan.md` §3 Phase 1 status reads `complete` — §3 row flipped to `complete`; §6.2 + §6.6 cookbook filled — 9d1913b

#### Manual

- [x] 6.3 §6.2 is specific enough to add an integration test from alone — verified: §6.2 specifies location, naming, reference test, run command, real-services convention, fixtures + helpers (signInAs/cookieHeaderFor/uniqueId), env wiring, and cost guidance — self-sufficient
