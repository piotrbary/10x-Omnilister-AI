---
bootstrapped_at: 2026-05-25T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: omnilister-ai
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: omnilister-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Omnilister AI is a 3-week after-hours MVP for a JS web-app with auth and external AI integration. The 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates: typed (TypeScript end-to-end with Zod schemas), convention-based (Astro file-based routing + island architecture), well-documented, and popular in JS training data. Supabase covers auth (FR-001, FR-002) and image file storage (FR-005) out of the box, eliminating two infrastructure decisions from the MVP critical path. Cloudflare Pages is the starter's native deployment target and pairs naturally with Cloudflare Workers, which will be the recommended routing layer for long-running AI transformation calls (the 60-second NFR exceeds standard edge function limits if routed naively). CI runs on GitHub Actions with auto-deploy-on-merge. AI integration (FR-007, FR-009, FR-011) will be added manually via Astro API routes or Supabase Edge Functions — no vetted JS/web-app starter in the registry carries this first-class.

## Pre-scaffold verification

| Signal      | Value                                             | Severity | Notes                                                    |
| ----------- | ------------------------------------------------- | -------- | -------------------------------------------------------- |
| npm package | not run — cmd_template uses `git clone`, no npm CLI | n/a    | git-clone strategy; npm recency check skipped by design  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh | from card docs_url; 8 days before bootstrap run |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (cloned starter repo, stripped upstream git history before move-up)
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (starter's CLAUDE.md; cwd version preserved)
**.gitignore handling**: moved silently (no prior .gitignore in cwd)
**.bootstrap-scaffold cleanup**: deleted

### File move log

| File / Directory       | Action                              |
| ---------------------- | ----------------------------------- |
| `.github`              | moved                               |
| `.husky`               | moved                               |
| `.vscode`              | moved                               |
| `node_modules`         | moved                               |
| `public`               | moved                               |
| `src`                  | moved                               |
| `supabase`             | moved                               |
| `.env.example`         | moved                               |
| `.gitignore`           | moved silently (no cwd version)     |
| `.nvmrc`               | moved                               |
| `.prettierrc.json`     | moved                               |
| `astro.config.mjs`     | moved                               |
| `CLAUDE.md`            | conflict — existing wins; scaffold copy → `CLAUDE.md.scaffold` |
| `components.json`      | moved                               |
| `eslint.config.js`     | moved                               |
| `package.json`         | moved                               |
| `package-lock.json`    | moved                               |
| `README.md`            | moved                               |
| `tsconfig.json`        | moved                               |
| `wrangler.jsonc`       | moved                               |

Note: `context/` was absent in the scaffold — no drops required. Existing cwd files (`CLAUDE.md`, `idea_omnilister_ai.md`, `OmniLister_AI_App_Screens_Showcase.pptx`, `.claude/`, `.cursor/`) were untouched.

Note: `npm install` required `NODE_OPTIONS=--use-system-ca` due to SSL certificate verification issues with the Windows system CA store. This is an environment-level issue; the starter itself is unaffected.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/7/0 direct of total 0/1/9/0 (CRITICAL/HIGH/MODERATE/LOW)

#### CRITICAL findings

None.

#### HIGH findings

**`devalue`** (transitive — pulled in by `wrangler`)
- Advisory: GHSA-77vg-94rm-hx3p — "Svelte devalue: DoS via sparse array deserialization"
- CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
- CWE: CWE-770 (Allocation of Resources Without Limits or Throttling)
- Affected range: `>=5.6.3 <=5.8.0`
- Fix: upgrade `wrangler` once a version shipping a patched `devalue` is released upstream
- URL: https://github.com/advisories/GHSA-77vg-94rm-hx3p
- Note: transitive — not directly actionable until `wrangler` releases a fix

#### MODERATE findings

Direct (7 packages — depend on a version range with known advisories):

| Package                 | Notes                              |
| ----------------------- | ---------------------------------- |
| `@astrojs/check`        | MODERATE — advisory in dep chain   |
| `@astrojs/language-server` | MODERATE — advisory in dep chain |
| `@cloudflare/vite-plugin` | MODERATE — advisory in dep chain |
| `miniflare`             | MODERATE — advisory in dep chain   |
| `volar-service-yaml`    | MODERATE — advisory in dep chain   |
| `wrangler`              | MODERATE — advisory in dep chain   |
| `yaml-language-server`  | MODERATE — advisory in dep chain   |

Transitive (2 packages):

| Package | Notes                              |
| ------- | ---------------------------------- |
| `ws`    | MODERATE — transitive              |
| `yaml`  | MODERATE — transitive              |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                  | Value                  |
| --------------------- | ---------------------- |
| bootstrapper_confidence | first-class          |
| quality_override      | false                  |
| path_taken            | standard               |
| self_check_answers    | null                   |
| team_size             | solo                   |
| deployment_target     | cloudflare-pages       |
| ci_provider           | github-actions         |
| ci_default_flow       | auto-deploy-on-merge   |
| has_auth              | true                   |
| has_payments          | false                  |
| has_realtime          | false                  |
| has_ai                | true                   |
| has_background_jobs   | false                  |

These hints are preserved in the audit trail for the future M1L4 skill (agent context setup) to act on. In v1 bootstrapper surfaces them but takes no automated compensating action.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — this is the starter's default CLAUDE.md. Merge any useful sections into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — the `devalue` HIGH finding is transitive via `wrangler` and will resolve when Cloudflare releases a patched wrangler version. The full breakdown is in this log.
- Set up your `.env` file: copy `.env.example` to `.env` and fill in your Supabase and Cloudflare credentials.
- `NODE_OPTIONS=--use-system-ca` is required for npm commands in this environment due to SSL CA configuration. Consider adding it to your shell profile or a project `.npmrc`.
