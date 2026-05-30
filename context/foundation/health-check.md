---
project: omnilister-ai
checked_at: 2026-05-25T00:00:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: false
ci_provider: github-actions
recommended_fixes: 2
---

## Dependency Health

### Lockfile

```
Status:          present (package-lock.json)
Package manager: npm
```

Lockfile is committed. Dependency versions are pinned and builds are reproducible.

### Security Audit

```
Tool:   npm audit --json
Status: failed to run
Reason: UNABLE_TO_VERIFY_LEAF_SIGNATURE — environment-level SSL certificate
        interception (likely a corporate proxy or custom CA). The npm registry
        request cannot be verified. This is a network/environment configuration
        issue, not a project issue.
```

The audit could not be executed in this environment. To run it manually, try:

```bash
# Option 1 — use system CA (Node.js 22+)
node --use-system-ca $(which npm) audit

# Option 2 — trust the corporate proxy CA
npm config set cafile /path/to/corporate-ca.crt
npm audit
```

No vulnerability counts are available from this run. Audit findings default to 0 for the purposes of the health verdict — not because the project is clean, but because the check could not run.

### Outdated Dependencies

```
Status: skipped — same SSL error prevented registry contact
```

Could not retrieve latest version data. To check manually once the SSL issue is resolved:

```bash
npm outdated
```

## Test Suite

```
Test runner:    not detected
Tests found:    not applicable
Test execution: not attempted
```

⚠ **No test runner detected.** No Vitest, Jest, Playwright, Cypress, Mocha, or equivalent is present in `package.json` (dependencies or devDependencies). No `vitest.config.*`, `jest.config.*`, or `playwright.config.*` found.

The agent cannot verify the correctness of its own changes. For Omnilister AI — which will involve AI transformation pipelines, Supabase data flows, and image upload logic — this gap compounds with feature complexity. Changes that break behaviour will only surface via manual testing or production errors.

Recommended setup for this stack:

```bash
# Unit + integration tests (Vitest — native Vite/Astro toolchain, no extra config)
npm init vitest@latest

# E2E tests (Playwright — for auth flows and image upload/transformation flows)
npm init playwright@latest
```

After setup, add test scripts to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

## CI/CD

```
Provider:      GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                              |
|------------|--------|--------------------------------------------------------------------|
| Lint       | ✓      | `npm run lint` — ESLint 9 with typescript-eslint strictTypeChecked |
| Test       | ✗      | No test step — no test runner configured                           |
| Build      | ✓      | `npm run build` — Astro production build with Cloudflare adapter   |
| Type check | ✓      | Covered by ESLint `projectService: true` with strictTypeChecked    |
| Security   | ✗      | No `npm audit` or vulnerability scanning step                      |

CI runs on push and PR to `master`. Both lint and build are required to pass. Type safety is enforced through ESLint's type-aware rules rather than a standalone `tsc --noEmit` step — functionally equivalent for this setup. The test and security stages are the two missing pieces.

## Configuration

### Low severity

- **`.editorconfig` missing at root** — Prettier and ESLint already handle formatting and style enforcement, so this is genuinely low priority. Useful if contributors open the project in editors that respect EditorConfig but don't have the Prettier extension. Fix: create a `.editorconfig` at the root with indent style and charset settings (< 5 min).

### All other configuration: present

| File | Status |
|---|---|
| `tsconfig.json` (strict) | ✓ extends `astro/tsconfigs/strict` |
| `eslint.config.js` | ✓ strictTypeChecked + stylisticTypeChecked |
| `.prettierrc.json` | ✓ configured with Astro + Tailwind plugins |
| `.gitignore` | ✓ covers `dist/`, `.astro/`, `node_modules/`, `.env`, `.dev.vars` |
| `.env.example` | ✓ documents required secrets (`SUPABASE_URL`, `SUPABASE_KEY`) |
| `AGENTS.md` | ✓ hard rules, project structure, naming conventions, CI commands |
| `CLAUDE.md` | ✓ 10x module context and tool chain |

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready (4/4 gates passed)
```

| Quality Gate | Stack-Assess Finding | Health-Check Finding | Status |
|---|---|---|---|
| Typed | TypeScript 5 strict — pass | ESLint `strictTypeChecked` in CI, `tsconfig.json strict: true` | Confirmed |
| Convention-based | Astro file-based routing + AGENTS.md conventions — pass | AGENTS.md present with project structure, hard rules, and middleware convention | Confirmed |
| Popular in training data | Astro, React, TS, Supabase, Cloudflare all mainstream in JS family — pass | No contradicting evidence | Confirmed |
| Well-documented | All components have versioned official docs — pass | No contradicting evidence | Confirmed |
| **Notable gap (outside gates)** | No test runner — flagged in stack-assess | No test runner confirmed, no test step in CI | **Reinforced** |

The single gap identified in the stack assessment is reinforced: health-check finds no test runner installed and no test execution in the CI pipeline.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. No test runner

**Impact**: The agent cannot verify correctness of its own changes. Without a test runner, the only feedback signal is "did `npm run build` succeed?" — which catches type errors but not logic errors, data flow bugs, or auth regressions. For AI transformation pipeline logic and Supabase data flows, this gap means bugs surface in manual testing or production.

**Severity**: high
**Effort**: significant (> 1 hour for initial setup + first tests)

**Fix**:

```bash
# 1. Install Vitest for unit and integration tests
npm init vitest@latest
# Follow the interactive prompts; choose "browser: no" for server-side code

# 2. Install Playwright for E2E tests covering auth and image upload flows
npm init playwright@latest
# Choose Chromium at minimum; add to existing package.json

# 3. Add scripts to package.json
# "test": "vitest run"
# "test:watch": "vitest"
# "test:e2e": "playwright test"

# 4. Write your first smoke test — e.g., a Vitest unit test for the quality scoring logic
# once it exists, or a Playwright test for the sign-up → sign-in flow that's already live
```

Priority test targets for Omnilister AI (once the features exist): quality score calculation (FR-009), image transformation pipeline logic (FR-011), auth guard middleware (`src/middleware.ts`), and Supabase file upload/retrieval flows (FR-005).

---

#### 2. Missing `.editorconfig`

**Impact**: Minimal. Prettier and ESLint already enforce formatting. This only matters for editors without Prettier support, or when contributors paste code between environments with different default line endings (Windows ↔ macOS).

**Severity**: low
**Effort**: quick (< 5 min)

**Fix**:

Create `.editorconfig` at the root:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

### Addressed in upcoming lessons (Category B)

#### No test step in CI

**Lesson**: This follows naturally from adding the test runner (Category A fix #1). Once Vitest and Playwright are set up and passing locally, add to `.github/workflows/ci.yml`:

```yaml
- run: npm test
- run: npx playwright install --with-deps
- run: npm run test:e2e
```

No separate lesson needed — this is the direct consequence of the Category A fix.

---

#### No security scan in CI

Once the SSL environment issue is resolved, add an `npm audit` step to CI:

```yaml
- run: npm audit --audit-level=high
```

This step fails on HIGH or CRITICAL findings, which is the right default for a production project.

---

#### No Cloudflare deployment pipeline in CI

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)

**What you'll do there**: Wire the Cloudflare Pages / Workers deployment to the CI pipeline using Wrangler, configure production secrets, and establish the deploy-on-merge workflow. The current `wrangler.jsonc` config is already correct for the runtime — the lesson adds the CI glue and the production secret management.

---

## Summary

**Health status: needs-attention**

The project has a strong foundation: TypeScript strict mode, type-aware ESLint, Prettier, a well-structured CI pipeline (lint + build), both `AGENTS.md` and `CLAUDE.md` present and substantive, `.env.example` committed, and all four agent-friendly quality gates passing from the stack assessment. The single meaningful gap is the missing test runner — there is no automated way for the agent to verify the correctness of code it writes. For an MVP that will involve AI transformation pipelines and image upload flows, this gap will matter more as features accumulate.

Next step: install Vitest and write the first tests for the features that exist (auth middleware, Supabase client utilities). Playwright E2E can follow when the image transformation flow is implemented. Once tests are passing locally, add the test step to CI and proceed to the infrastructure and deployment lesson.
