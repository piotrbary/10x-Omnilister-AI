---
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
---

## Why this stack

Omnilister AI is a 3-week after-hours MVP for a JS web-app with auth and external AI integration. The 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates: typed (TypeScript end-to-end with Zod schemas), convention-based (Astro file-based routing + island architecture), well-documented, and popular in JS training data. Supabase covers auth (FR-001, FR-002) and image file storage (FR-005) out of the box, eliminating two infrastructure decisions from the MVP critical path. Cloudflare Pages is the starter's native deployment target and pairs naturally with Cloudflare Workers, which will be the recommended routing layer for long-running AI transformation calls (the 60-second NFR exceeds standard edge function limits if routed naively). CI runs on GitHub Actions with auto-deploy-on-merge. AI integration (FR-007, FR-009, FR-011) will be added manually via Astro API routes or Supabase Edge Functions — no vetted JS/web-app starter in the registry carries this first-class.
