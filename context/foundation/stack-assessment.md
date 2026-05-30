---
project: omnilister-ai
assessed_at: 2026-05-25T00:00:00Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript 5
  framework: Astro 6 SSR + React 19 islands
  build_tool: Astro CLI / Vite (Cloudflare adapter)
  test_runner: null
  package_manager: npm
  ci_provider: github-actions
  deployment_target: cloudflare-workers-pages
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Language — TypeScript 5.9** with `astro/tsconfigs/strict` base configuration. Strict mode enabled end-to-end; ESLint runs `strictTypeChecked` + `stylisticTypeChecked` with `projectService: true` for full type-aware linting across `.ts`, `.tsx`, and `.astro` files.

**Framework — Astro 6 (SSR, `output: "server"`) + React 19 (island integration).** Astro provides file-based routing, island architecture, and a Cloudflare Workers adapter. React 19 is used for interactive client-side components. Tailwind CSS 4 is integrated via the Vite plugin.

**Build tool — Astro CLI / Vite** with `@astrojs/cloudflare` adapter and `@tailwindcss/vite` plugin. Wrangler 4 handles Cloudflare Workers deployment.

**Backend / DB — Supabase** (`@supabase/supabase-js` v2, `@supabase/ssr` v0.10) for authentication and file storage. Supabase CLI (`supabase` package) for local development.

**Package manager — npm** (confirmed by `package-lock.json` presence).

**CI/CD — GitHub Actions** (`.github/workflows/ci.yml`): runs `npm ci → astro sync → lint → build` on push and PR to `master`. Both lint and build must pass; build requires `SUPABASE_URL` and `SUPABASE_KEY` secrets.

**Deployment — Cloudflare Workers/Pages** (`wrangler.jsonc`: `nodejs_compat` flag, `main: @astrojs/cloudflare/entrypoints/server`).

**Test runner — none.** No Vitest, Jest, Playwright, Cypress, or other testing framework detected in `package.json` or any config file.

**Instruction files — `AGENTS.md`, `CLAUDE.md`.** Both present and substantive. `AGENTS.md` documents project structure, hard rules, naming conventions, secrets handling, and CI commands. `CLAUDE.md` carries the 10x module context and tool chain.

## Quality Gate Assessment

| Component     | Typed | Convention | Training Data | Documented | Verdict |
|---------------|-------|------------|---------------|------------|---------|
| Language (TS) |  ✓    |     —      |       —       |     —      | pass    |
| Framework     |  —    |     ✓      |       ✓       |     ✓      | pass    |
| Build tool    |  —    |     ✓      |       ✓       |     ✓      | pass    |
| Test runner   |  —    |     —      |       —       |     —      | n/a †  |

†  Not installed. Not a quality gate failure, but noted as a gap.

Legend: ✓ = pass, — = not applicable

### Gate Details

**Typed — PASS.**
`tsconfig.json` (line 1) extends `astro/tsconfigs/strict`. ESLint (`eslint.config.js:14–18`) applies `tseslint.configs.strictTypeChecked` and `tseslint.configs.stylisticTypeChecked` with `projectService: true`, enabling full type-aware linting. TypeScript 5.9 in devDependencies. Every `.ts`, `.tsx`, and `.astro` file is covered by lint-staged on commit.

**Convention-based — PASS.**
Astro ships strong structural opinions: `src/pages/` owns all file-based routes, `src/pages/api/` owns server endpoints, `src/layouts/` owns Astro layouts, `src/components/` owns `.astro` and `.tsx` components, `src/lib/` owns shared utilities. Island architecture (React only where interactivity is needed) is a first-class Astro convention. Auth guard is centralised in `src/middleware.ts` — `AGENTS.md:19–20` enforces this as a hard project rule. Evidence: `astro.config.mjs`, `AGENTS.md` Project Structure section, `src/` directory tree.

**Popular in training data (within JS family) — PASS.**
Astro (launched 2021, >45k GitHub stars), React 19 (dominant JS UI library), TypeScript, Tailwind CSS, Supabase, and Cloudflare Workers are all well-represented in the JS/TS training corpus. Extensive community tutorials, Stack Overflow coverage, and official docs for each component. Assessment is within the JS language family — not compared globally against other ecosystems.

**Well-documented — PASS.**
All major components have current, versioned official documentation:
- Astro: docs.astro.build (versioned per release)
- React: react.dev
- Supabase: supabase.com/docs
- Tailwind CSS 4: tailwindcss.com
- Cloudflare Workers/Pages: developers.cloudflare.com
- Wrangler: developers.cloudflare.com/workers/wrangler

## Gaps & Compensation

All four quality gates pass. No compensation is required for agent-readiness.

### Notable gap outside the four gates: No test runner

`package.json` has no testing framework in dependencies or devDependencies (no Vitest, Jest, Playwright, Cypress, or equivalent). CI only runs `lint` and `build` — zero automated test execution. This does not affect the quality gate score but limits the correctness feedback loop: an agent making changes cannot validate behavior via tests. For Omnilister AI — which will involve AI transformation pipelines, Supabase data flows, and image processing — this gap will compound as feature complexity grows.

### Recommended Instruction File Additions

The following block can be appended to `AGENTS.md` when a test runner is added (or as a placeholder now to signal the gap to the agent):

```markdown
## Testing

No test runner is currently configured. Until one is added, verify feature
correctness by running `npm run build` (catches type errors) and manual
browser testing. Do NOT claim a change is "tested" based on lint alone.

When adding a test runner, prefer Vitest (compatible with Astro/Vite toolchain,
no separate config needed). Integration tests for Supabase flows should target
a local Supabase instance (`supabase start`), not the hosted project.
Use Playwright for end-to-end auth and image upload flows.
```

## Summary

**Agent readiness: ready.** All four quality gates pass with no compensation required.

**Key strengths:**
- TypeScript strict mode with full type-aware ESLint gives agents precise, machine-readable contracts throughout the codebase.
- Astro's file-based routing and documented project layout (`AGENTS.md` Project Structure section) give agents a reliable navigation map with no ambiguity about where things live.
- Every major component (Astro, React, Supabase, Tailwind, Cloudflare) has current official documentation agents can fetch directly.
- `AGENTS.md` already carries hard rules, naming conventions, and secrets discipline — agents can operate without discovering conventions by trial and error.

**Key gap:** No test runner installed. Worth addressing before AI transformation pipeline code is added — Vitest (unit/integration) + Playwright (E2E for auth and image upload flows) is the natural fit for this stack.

**Recommended next step: `/10x-health-check`**
