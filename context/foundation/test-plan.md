# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-29

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data. The two heaviest
   inputs here are a lived incident (mock data reached production) and the
   owner's stated top fear (registration / email-confirmation / login).
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excludes
`agent-sdk-examples/`, `packages/`, build output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | A saved transformation has a score ≤ the original — the product's one measurable promise (`score_after > score_before`) silently fails | High | High | PRD §Primary Success Criteria; roadmap S-05 north star ("serwer zapisuje transformacje bez porównania score_after vs score_before") |
| 2 | AI transform invokes the wrong/no model, returns no usable image, or the result never reaches the user's account | High | High | interview Q1c/Q1d/Q1f; hot-spot dir `src/lib/` (transformation-processor, openrouter-images — 4 commits/30d each) |
| 3 | A new user can't complete registration — the confirmation email is never sent/delivered, or the confirm→login gate is broken — blocking entry to the entire product | High | High | interview Q1a (stated #1 fear), Q3; PRD FR-001/FR-002; hot-spot dir `src/components/auth/` (7 commits/30d), `src/pages/auth/` (5), `src/middleware.ts` (4) |
| 4 | One account reaches another's photos / objects / private styles (authenticated but wrong owner — IDOR / RLS gap) | High | Medium | interview Q3/Q4 (security); PRD NFR per-account isolation; hot-spot dir `src/pages/api/` (31 commits/30d) |
| 5 | The guest-transform endpoint runs costly AI for unauthenticated callers (resource / cost abuse, possible data path) | High | Medium | interview Q4 ("guest-transform endpoint with no auth"); hot-spot dir `src/pages/api/` (31 commits/30d) |
| 6 | Mock / stub data reaches a production code path — the user sees fake scores or results believing they are real | High | Medium | interview Q2 (lived incident — "mock leaked to production") |
| 7 | An uploaded image is not persisted to the account, or the 100 MB storage accounting drifts | High | Medium | interview Q1e; PRD FR-005/FR-012, NFR `Max_Client_Repository = 100 MB`; hot-spot dir `src/pages/api/` (31 commits/30d) |

Risks #4 (IDOR / authorization) and #5 (resource abuse) are the abuse /
security rows — the happy path excludes the attacker, so they were added
under the abuse lens, not raised by the interview alone.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Saving a transform where `score_after ≤ score_before` is rejected server-side (409 + delta); only improvements persist | "The UI checkbox already prevents it" — the server must enforce, not trust the client | The save entry point, where score_before/score_after are persisted, the override path | integration (save endpoint) | Oracle problem: don't lift the expected score from the scoring code — assert the *business rule* (after > before), not a recomputed number |
| #2 | A transform request reaches the intended model and ends with a real image saved to the right account; failures surface a clean error, not a fake/partial result | "200 means it worked" — verify a real image artifact landed, not just a status code | The transform pipeline entry, the OpenRouter boundary, where the result image is persisted | integration (transform→result→save), OpenRouter mocked at the network edge | Over-mocking internals so the test passes without the pipeline actually wiring model→image→storage |
| #3 | A fresh signup triggers a confirmation-email dispatch; an unconfirmed user can't log in; a confirmed user lands authenticated | "Supabase obviously sends the email" — assert the send is actually *triggered* | The signup entry, the email-send boundary (Supabase/SMTP), the confirm→session transition, what middleware gates | integration (auth flow) → 1 e2e | Mocking the email step away so the test never checks it fired; happy-path login that skips the confirmation branch |
| #4 | Account A's API calls for B's photo/object/style return 403/404, not data | "Logged-in == authorized" — ownership ≠ authentication | The API route auth/ownership check, how RLS and app-layer checks interact | integration (API route, two distinct users) | Testing only the your-own-resource path; never asserting the cross-account denial |
| #5 | Guest-transform enforces its intended limit/auth boundary, or is provably scoped so cost can't run unbounded | "The guest path is harmless" — confirm what actually gates cost/abuse | The guest endpoint's intended limit, what bounds repeated/anonymous calls | integration (endpoint, no session) | Asserting the happy guest call works without asserting the abuse boundary |
| #6 | A production request never returns mock/stub data; mock paths are unreachable when running as production | "The mock is obviously dev-only" — prove it's gated, don't assume | Where mock/stub data originates, what env flag gates it, which prod paths can reach it | integration + a guard test/CI assertion | A snapshot that happens to match the mock; a test that green-lights the leak |
| #7 | An upload persists to the right account and `storage_used` reflects it; exceeding 100 MB blocks with a clear message | "Upload returned 200 == saved & counted" — verify persistence *and* accounting | The upload entry (signed URL flow), where the row + storage counter are written, the cap-enforcement branch | integration (upload→storage) | Asserting the API response shape only, never the stored row or the counter |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | Harness + auth & access security | Bootstrap a root `vitest.config` + Supabase test fixtures; prove the registration/email-confirm gate works and the API enforces ownership and the guest boundary | #3, #4, #5 | integration | complete | context/changes/testing-harness-auth-access-security/ |
| 2 | Storage & persistence integrity | Prove uploads land on the right account with correct 100 MB accounting, and production never serves mock data | #7, #6 | integration + CI guard | not started | — |
| 3 | Transformation correctness & score enforcement | Prove transform→image→save reaches the right account/model and that score-regression is enforced server-side (north star) | #2, #1 | integration | not started | — |
| 4 | E2E critical flow + quality-gates wiring | One Playwright e2e on upload→transform→save (covers the "API/first-page/infra works" smoke); wire lint + typecheck + test + e2e into CI | cross-cutting | e2e, gates | not started | — |

**Status vocabulary** (fixed — parser literals):

| Value | Meaning |
|-------|---------|
| `not started` | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched` | `research.md` exists in the change folder. |
| `planned` | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete` | Progress section is fully `[x]`. |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | ^4.1.7 | Wired (`npm test` → `vitest run`); only 2 unit files today, both pure helpers in `src/lib/`. No root `vitest.config` yet — Phase 1 adds it. |
| mutation (existing) | Stryker (vitest-runner) | ^9.6.1 | Already installed; runs over the 2 unit files. Keep, don't expand in this rollout. |
| integration | none yet — see §3 Phase 1 | — | Needs root `vitest.config` + Supabase test fixtures (test account exists: `testuser@demo.com`). |
| API/AI mocking | none yet — see §3 Phase 3 | — | Mock OpenRouter at the network edge only; never mock internal pipeline modules. |
| e2e | none yet — see §3 Phase 4 | — | Playwright not installed; Phase 4 adds it for the upload→transform→save flow. |

**Stack grounding tools (current session):**
- Docs: Context7 — available; use for current Vitest 4 config, Supabase test-client, and Playwright setup APIs when Phase 1/4 land; checked: 2026-06-28
- Search: Exa.ai — available; use only to find current official docs/status, then prefer the primary source; checked: 2026-06-28
- Runtime/browser: Playwright MCP — not installed in project; Phase 4 introduces Playwright as the e2e layer; checked: 2026-06-28
- Provider/platform: Supabase MCP + Cloudflare MCP — available; read-only advisors/logs (Supabase) and deploy/log verification (Cloudflare Workers) can support the Phase 4 pre-prod smoke gate; checked: 2026-06-28

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift (`npm run lint`, `npm run typecheck`) |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions, auth/ownership/persistence breaks |
| mock-in-prod guard | CI | required after §3 Phase 2 | mock/stub data reaching a production path (Risk #6) |
| e2e on critical flow | CI on PR | required after §3 Phase 4 | broken upload→transform→save path; first-page/API/infra smoke |
| post-edit hook | local (agent loop) | recommended (local only) | regressions at edit time; not a CI substitute |
| pre-prod smoke | between merge + prod | optional | Cloudflare Workers deploy / env-specific failures (via Cloudflare MCP) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: next to the unit under test in `src/lib/` (existing convention).
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/quality-scoring.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Adding an integration test (API route, auth, persistence)

- **Location**: `tests/integration/**`, grouped by area
  (`api/`, `auth/`, `transformations/`).
- **Naming**: `<area>.test.ts` (e.g. `api/photos-ownership.test.ts`,
  `auth/registration-gate.test.ts`).
- **Reference test**: `tests/integration/api/photos-ownership.test.ts`
  (two real users, real RLS, the IDOR red→green case).
- **Run locally**: start local Supabase once (`npx supabase start`), then
  `npm test`. `supabase start` applies migrations + `supabase/seed.sql`.
- **Real services, no mocks**: tests run against a real local Supabase and
  real (cost-minimized) OpenRouter — no Supabase client mock, no
  `astro:env/server` mock. The only mocks anywhere are the deliberate-failure
  cases in `src/lib/quality-scoring.test.ts` (a real API can't be forced to 503).
- **Fixtures**: two seeded users (A/B) in `supabase/seed.sql`
  (`usera@/userb@test.local`, password `testpass123`). Helpers in
  `tests/integration/setup.ts`: `signInAs("A"|"B")` returns a session-bearing
  Supabase client; `cookieHeaderFor("A"|"B")` mints a real `@supabase/ssr` auth
  cookie to replay as a request `Cookie` header (so route/middleware handlers
  run under that user's JWT with RLS active); `uniqueId(prefix)` for collision-
  free per-test rows. Each test owns setup → action → assertion → cleanup.
- **Env**: `.env.test` points at local Supabase (committed; local publishable
  key, not a secret); `.env` supplies `OPENROUTER_API_KEY`; `.env.test.remote`
  documents the remote override (copy to gitignored `.env.test.local`).
- **OpenRouter cost**: pass the minimal-cost model from `src/lib/config.ts` +
  the smallest valid image; assert the contract (non-empty result, status),
  never exact pixels.

### 6.3 Adding a transform / score-enforcement test

- TBD — see §3 Phase 3 (transform→image→save reaches the right account;
  server rejects `score_after ≤ score_before`). Oracle is the business
  rule, never a number recomputed from the scoring code.

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4 (Playwright on upload→transform→save).

### 6.5 Guarding against mock data in production

- TBD — see §3 Phase 2 (assert prod paths can't reach mock/stub data).

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, the implementing skill appends a 2–3 line
note here capturing anything surprising the phase taught — e.g., fixture
locations, the shape of the Supabase test client, how the email-send
boundary is asserted.)

**Phase 1 (harness + auth & access security):**
- The `getViteConfig` bridge resolves `astro:env/server` (and `astro:middleware`)
  in vitest, but loading `astro.config.mjs` pulls the Cloudflare adapter's Vite
  plugin which rejects the test env — so `vitest.config.ts` passes
  `configFile: false` and mirrors the `astro:env` schema inline (keep in sync).
  Stryker uses a separate `vitest.config.unit.ts` (src-only) so mutation runs
  skip `tests/integration/**`.
- Seeded `auth.users` need **non-null token columns** (`confirmation_token`,
  `recovery_token`, `email_change*` = `''`) or sign-in crashes; the new GoTrue
  also needs a matching `auth.identities` row. `enable_confirmations = false`
  locally makes seeded/signed-up users immediately sign-in-able.
- Handlers read the session from the request **Cookie header** (not the
  AstroCookies object), so tests inject auth via `cookieHeaderFor` and set
  `context.locals.user`; queries then run under real RLS — no Supabase mock.
- The IDOR fix is asserted red→green by toggling the storage-path guard. CI
  wiring (gate "unit+integration required after Phase 1") is deferred to the
  lesson that owns CI/CD config per `CLAUDE.md` — gate is named, not yet wired.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **GDPR / UODO phase-2 features (FR-P2-001–FR-P2-007)** — deferred per PRD
  §Non-Goals; not in the MVP surface. Re-evaluate before public registration
  launch. (Source: Phase 2 interview Q5; PRD.)
- **Marketing / static pages** — low blast radius, no data effect. Re-evaluate
  if they gain interactive/auth behavior. (Source: Phase 2 interview Q5.)
- **Generated Supabase types (`database.generated.ts`)** — the generator is
  the oracle. Re-evaluate if hand-edited. (Source: challenger pass.)
- **Draft-pipeline NFR (<5s preview)** — parked (roadmap hot-1, not
  implementable with the current synchronous model). Re-evaluate if a
  two-phase pipeline is built. (Source: roadmap §Parked.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-28
- Stack versions last verified: 2026-06-28
- AI-native tool references last verified: 2026-06-28

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
