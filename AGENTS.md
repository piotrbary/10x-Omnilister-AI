# Repository Guidelines

Omnilister AI is a web application built on the 10x Astro Starter: Astro 6 (SSR) + React 19 (islands) + TypeScript 5 strict + Tailwind CSS 4 + Supabase (auth/storage) + Cloudflare Workers edge runtime.

## Hard Rules

- **Never expose Supabase credentials client-side.** `SUPABASE_URL` and `SUPABASE_KEY` are declared `context: "server", access: "secret"` in `@astro.config.mjs`. Any client-side import is a security bug.
- **Never use `set:html` without sanitization.** ESLint rule `astro/no-set-html-directive` is set to `error`.
- **Cloudflare edge constraints.** Do not call Node.js APIs not covered by the `nodejs_compat` compatibility flag — they fail silently at runtime.
- **Centralise route protection in `src/middleware.ts`.** Add protected paths to `PROTECTED_ROUTES`; per-page redirects are a bug.

## Project Structure

- `src/pages/` — file-based Astro routes
- `src/pages/api/` — server endpoints
- `src/components/` — `.astro` and `.tsx` components
- `src/layouts/` — Astro layouts
- `src/lib/` — Supabase client and shared utilities
- `src/middleware.ts` — auth guard; add protected paths to `PROTECTED_ROUTES` here
- `supabase/` — local Supabase CLI config
- `wrangler.jsonc` — Cloudflare Workers runtime config

`@/*` maps to `src/*` (see `@tsconfig.json`).

## Build, Test, and Development Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Cloudflare workerd runtime) |
| `npm run build` | Production build — requires `SUPABASE_URL` + `SUPABASE_KEY` |
| `npm run lint` | ESLint with strict type-checked rules |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Prettier across all file types |
| `npm run preview` | Preview production build locally |

CI (`@.github/workflows/ci.yml`): `npm ci → astro sync → lint → build` on every push and PR to `master`. Both lint and build must pass. Build requires `SUPABASE_URL` and `SUPABASE_KEY` as GitHub repository secrets.

## Coding Style & Naming Conventions

TypeScript strict mode throughout (`astro/tsconfigs/strict`). React Compiler plugin is active — do not add manual `useMemo`/`useCallback` where the compiler handles it (`react-compiler/react-compiler: error`). Prefix intentionally unused variables with `_`. Remove `console.*` calls before committing (`no-console: warn`). Lint-staged runs `eslint --fix` and `prettier --write` automatically on each commit.

## Secrets & Configuration

Copy `.env.example` to `.env` for local development; copy it to `.dev.vars` as well for the Cloudflare workerd runtime. Never commit either file. Set `SUPABASE_URL` and `SUPABASE_KEY` as GitHub repository secrets for CI and as Cloudflare dashboard secrets for production.

## Commit & Pull Request Guidelines

No commit convention established yet. Use imperative-mood messages (`Add`, `Fix`, `Update`). PRs target `master`.
