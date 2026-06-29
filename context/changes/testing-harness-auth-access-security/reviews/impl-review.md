<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Harness + Auth & Access Security

- **Plan**: context/changes/testing-harness-auth-access-security/plan.md
- **Scope**: Phases 3–6 of 6 (this session)
- **Date**: 2026-06-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Integration suite is not enforced in CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: .github/workflows/ (no test job)
- **Detail**: §5 gate "unit+integration required after Phase 1" was named but nothing ran `npm test` on PRs.
- **Fix**: Added a separate `.github/workflows/test.yaml` (start local Supabase → seed → `npm test` with `OPENROUTER_API_KEY` secret), keeping `ci.yml` untouched. Unverified from local (no Actions runner); requires the `OPENROUTER_API_KEY` repo secret.
- **Decision**: FIXED — created `.github/workflows/test.yaml` (user override of the CLAUDE.md CI-YAML boundary)

### F2 — Signup test leaves an orphan auth user (no cleanup)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/auth/registration-gate.test.ts:25-48
- **Detail**: Plan said "clean up the created user," but anon can't delete `auth.users` and the test env has no service-role key. Safe on local (ephemeral + unique email); accumulates against a remote.
- **Fix**: Best-effort admin cleanup via `SUPABASE_SERVICE_ROLE_KEY` when present, else no-op.
- **Decision**: SKIPPED — left unchanged per user (documented ponytail note in-file; safe on local)

### F3 — Setup helper is an imported module, not a vitest setupFile

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/integration/setup.ts
- **Detail**: Phase 3 contract said "Wire it via test.setupFiles"; it was implemented as a plain imported helper.
- **Fix**: Added `setupFiles: ["./tests/integration/setup.ts"]` to the default vitest config (main config only; Stryker's unit config keeps `setupFiles: []`). Safe — no top-level side effects; env guard stays inside the helpers.
- **Decision**: FIXED — wired via setupFiles in vitest.config.ts; suite still 21/21

### F4 — Extra (a') legit-201 test beyond the plan's (a)/(b)/(c)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/integration/api/photos-ownership.test.ts:64-82
- **Detail**: A positive own-prefix → 201 case was added (not in the plan's list); it proves the guard doesn't over-reject and stands in for manual 4.4.
- **Fix**: Reconcile the plan with reality (keep the valuable test).
- **Decision**: FIXED — documented in plan §Testing Strategy ("legit own-prefix → 201"); test kept

### F5 — Seed users have fixed UUIDs (linked-remote reset hazard)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql
- **Detail**: Local-fixtures only; `supabase db reset --linked` against prod would inject the two test users. Standard practice; `ON CONFLICT DO NOTHING` keeps it idempotent.
- **Decision**: SKIPPED — left unchanged per user (local-only intent; footgun noted)
