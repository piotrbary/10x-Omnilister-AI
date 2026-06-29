# Testing Harness + Auth & Access Security (Phase 1) — Plan Brief

> Full plan: `context/changes/testing-harness-auth-access-security/plan.md`
> Research: `context/changes/testing-harness-auth-access-security/research.md`

## What & Why

Stand up the project's first real test harness and use it to protect the three
Phase-1 risks from the test plan: the registration/email-confirm gate (#3),
account isolation / IDOR (#4), and the unauthenticated guest-transform cost
boundary (#5). There is no `vitest.config` today and one live IDOR in
production — this phase fixes the bug and proves all three risks with real tests.

## Starting Point

`npm test` is a bare `vitest run` with no config — it globs `agent-sdk-examples`
and stale `.stryker-tmp` copies and **fails**. There are no Supabase fixtures and
no CI test gate. The confirm-upload endpoint accepts a client storage `path`
without validating it belongs to the user, and the `original-photos` bucket is
public — a real, reachable IDOR.

## Desired End State

`npm test` runs a scoped, green suite from a root config, exercising real
local-seeded Supabase and real (cost-minimized) OpenRouter. The IDOR is fixed and
proven by a test that's red before the guard and green after. CI runs the suite
as a PR gate, and the test-plan cookbook documents how to add an integration test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Fixture target | Local-seeded Supabase by default, remote by env override | Deterministic CI gate while keeping ad-hoc remote runs available | Plan |
| `astro:env/server` bridge | `getViteConfig` with real `.env.test` | One canonical bridge that supports real env + real Supabase sessions | Plan |
| Mocking | No Supabase/env mock; real DB everywhere. Mocks survive ONLY for deliberate-failure retry/error cases | Real RLS/AI is the actual signal; failures a real API won't reproduce still need a mock | Plan |
| OpenRouter in tests | Real calls, min-cost model + tiny image | Genuinely end-to-end while bounding spend to negligible | Plan |
| Scoring test | Convert happy path to real (invariants); keep retry/error cases mocked | Can't assert exact AI scores, and can't force real failures on command | Plan |
| Live IDOR | Fix it + passing test | Closes a real exploitable bug now instead of just documenting it | Plan / Research |
| Risk #3 scope | In-code seam now (signUp + middleware), confirm→session in Phase 4 | Email send/confirm is Supabase-hosted with no app route to assert cheaply | Plan / Research |
| Test layout | `tests/integration/` (separate from co-located unit tests) | Keeps slow real-DB/network tests out of Stryker mutation runs | Plan |
| CI wiring | Add `npm test` (real Supabase + key) to CI now | Makes the §5 "required after Phase 1" gate actually bite | Plan |

## Scope

**In scope:** root `vitest.config`; local Supabase fixtures (two seeded users);
guest-boundary test (#5); IDOR fix + ownership tests (#4); signup + middleware-gate
tests (#3); CI test job; cookbook §6.2/§6.6 + §3 status.

**Out of scope:** real email/confirm→session (Phase 4 e2e); guest
rate-limiting/size caps; the
secondary RLS-masked code inconsistencies (only the photos-list gap is
test-documented); Playwright/e2e; expanding Stryker.

## Architecture / Approach

Bootstrap-first. Phase 1 lands the config so anything can run; Phase 2 proves the
harness end-to-end with the no-Supabase guest test; Phase 3 adds fixtures; Phases
4–5 add the DB-dependent ownership and auth tests; Phase 6 wires CI and the
cookbook. Real services throughout — the only external cost (OpenRouter) is
bounded by model + image size, not by mocking.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness bootstrap | Root `vitest.config`, scoped green suite | `getViteConfig` is new to the repo |
| 2. Guest test (#5) + real scoring | Real end-to-end tests; scoring off its mock | Non-deterministic AI → assert invariants |
| 3. Supabase fixtures | Two seeded users, env wiring, setup helper | Manual `auth.users` insert gotchas |
| 4. IDOR fix + ownership (#4) | Path-validation guard + two-user tests | Not breaking legit confirm-upload |
| 5. Registration gate (#3) | signUp + middleware-gate tests | Asserting only the in-code seam |
| 6. CI + cookbook | PR test gate, §6 docs, §3 complete | Local Supabase + key in CI |

**Prerequisites:** local Docker for `supabase start`; `OPENROUTER_API_KEY` in
`.env.test` and as a CI secret.
**Estimated effort:** ~3–4 sessions across 6 phases.

## Open Risks & Assumptions

- A live `OPENROUTER_API_KEY` must exist in local test env and CI, or the
  real-call tests fail loudly.
- CI must run local Supabase (Docker on ubuntu runners) — heavier than the
  current build-only pipeline.
- `ci.yml` triggers on `master` while the repo default is `main` (pre-existing
  quirk to flag, not fix here).

## Success Criteria (Summary)

- `npm test` runs green against real Supabase + real cheap OpenRouter, scoped to
  project tests only.
- The IDOR test is red without the guard and green with it; cross-account reads
  return 404.
- CI gates PRs on the suite, and §6.2 documents how to add an integration test.
