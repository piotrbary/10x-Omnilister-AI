---
project: omnilister-ai
researched_at: 2026-05-25
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6.3.1
  runtime: Cloudflare Workers (workerd / V8 isolates)
  adapter: "@astrojs/cloudflare v13.5.0"
  wrangler: "v4.94.0"
  database: Supabase (auth + image storage, external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already targets Cloudflare Workers: `wrangler.jsonc` is present and correctly configured with `"main": "@astrojs/cloudflare/entrypoints/server"` and the `nodejs_compat` flag. The `@astrojs/cloudflare` adapter v13+ no longer supports Cloudflare Pages — Workers is the only deployment target for Astro 6. The 60-second AI transformation SLA is safe on Workers because pure network-wait time (waiting on an external AI API response) does not consume CPU time — there is no wall-clock limit for open HTTP connections, only a CPU time cap that network I/O does not count against. Cloudflare Workers scores 5/5 on all five agent-friendly criteria, is the native target for this stack, and the developer has prior Cloudflare familiarity. The global edge network across Cloudflare's 300+ PoPs directly serves the app's worldwide audience requirement. The Paid plan ($5/month base) is required for the increased CPU time limit; the Free plan's 10ms CPU cap is insufficient for AI-integrated routes.

**Critical note on deployment target:** `context/foundation/tech-stack.md` records `deployment_target: cloudflare-pages`. This is outdated — Cloudflare Pages is in maintenance mode and `@astrojs/cloudflare` v13+ does not support it. The correct deploy command is `npx wrangler deploy`, not `wrangler pages deploy`. Update `tech-stack.md` to reflect `deployment_target: cloudflare-workers`.

---

## Platform Comparison

Hard filters applied first: Q1 = stateless request/response (no persistent connection requirement) → no platforms dropped. All six platforms support TypeScript/JavaScript. Soft weights applied: DX over cost, Cloudflare familiarity (tiebreaker), global edge reach preferred, external providers acceptable (Supabase already chosen).

| Platform | CLI-first | Managed | Agent Docs | Deploy API | MCP | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Vercel** | Pass | Pass | Pass | Pass | Partial | **4.5/5** |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | **4.5/5** |
| **Render** | Partial | Pass | Pass | Pass | Partial | **4/5** |
| **Railway** | Partial | Partial | Partial | Pass | Partial | **3/5** |
| **Fly.io** | Partial | Pass | Partial | Pass | Fail | **3/5** |

**Scoring notes (all status checks dated 2026-05-25):**

- **CLI-first Partial**: Netlify, Railway, Render, and Fly.io lack a CLI rollback command — rollback requires a dashboard click or API call. Cloudflare (`wrangler rollback`) and Vercel (`vercel rollback`) have documented CLI rollback commands.
- **Managed Partial**: Railway's PostgreSQL and Redis are unmanaged Docker containers the user is responsible for; Fly.io Managed Postgres is "under active development" with security patches and version upgrades still in progress (production-preview status, checked 2026-05-25).
- **Agent Docs Partial**: Fly.io and Railway provide per-page markdown but neither publishes a site-wide `llms.txt`. Cloudflare, Vercel, Netlify, and Render all publish `llms.txt` and/or `llms-full.txt`.
- **MCP Partial/Fail**: Vercel MCP is Public Beta (checked 2026-05-25). Railway MCP is "work in progress" per their own docs. Render MCP is GA but excludes deploy triggering and some features are tier-gated. Fly.io's `fly mcp server` is experimental; Fly's own engineering team explicitly calls it "the wrong way to extend agent capabilities."

---

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The native deployment target for this stack. `wrangler.jsonc` is already configured, `@astrojs/cloudflare` v13.5.0 is installed, and `nodejs_compat` is enabled. Workers has no wall-clock time limit for open HTTP connections — network-wait time (the dominant cost of a 60-second AI call) does not consume CPU time at all. Cloudflare publishes first-class agent-readable documentation (`llms.txt` per product, per-page markdown at `/index.md`), and the official `cloudflare/mcp-server-cloudflare` MCP server (GA) covers Workers deployments, R2, KV, and observability in structured tool calls. `wrangler rollback` provides CLI-level rollback. The global edge network across 300+ PoPs matches the app's worldwide audience requirement. Co-located services (R2 for supplemental image storage, D1/KV, Workers AI) are available if needed as the app grows, even though Supabase handles the initial storage layer. The Paid plan ($5/month base) is required for CPU time beyond 10ms per request.

#### 2. Vercel

Scores 4.5/5. Astro SSR is GA via `@astrojs/vercel` with well-maintained adapter. `maxDuration` is configurable up to 300s on all plan tiers — the 60-second AI SLA is safely within limits. Vercel invented the `llms.txt` specification and publishes both `llms.txt` and `llms-full.txt`. The Vercel MCP server is Public Beta as of 2026-05-25 — functional but the API surface is subject to change. The gap vs. Cloudflare: requires adapter swap from `@astrojs/cloudflare` to `@astrojs/vercel` (non-trivial migration), MCP is beta not GA, no edge-native global compute (single-region serverless functions), and the Hobby plan is restricted to non-commercial use (Pro is $20/month for commercial projects). Supabase integrates cleanly via Vercel Marketplace.

#### 3. Netlify

Scores 4.5/5. Astro SSR is GA via `@astrojs/netlify`. The official Netlify MCP server is functionally production-ready (docs updated 2026-11-26, no explicit GA label but presented as production-ready with full setup guides). The critical operational risk for this app: the synchronous function timeout is exactly 60 seconds — matching the SLA with zero margin. Any AI API call taking 61 seconds hard-fails. The architecturally correct path requires Netlify Background Functions (15-minute timeout, GA) with an async invocation + polling pattern — a non-trivial architectural addition to the MVP. Credit-based pricing (since Sept 2025) makes the Free tier insufficient for 10k+ long AI transformations (each 60s call at 1 GB memory ≈ 0.028 credits; 10k calls ≈ 280 credits vs. 300-credit Free budget); Pro ($20/month) is the realistic floor.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** The workerd runtime (V8 isolates) rejects packages that use `fs`, `child_process`, or native binaries. The `nodejs_compat` flag (already enabled) polyfills most common Node.js APIs, but image processing libraries requiring native compiled binaries (e.g., `sharp`) are incompatible and fail at runtime — not at build time.

2. **Paid plan required from day zero.** The Free plan caps CPU at 10ms per request — trivially insufficient for any AI-integrated route. Billing must be configured before the first production deploy; this is an undocumented setup gate for the 3-week MVP timeline.

3. **Pages → Workers migration confusion in existing documentation.** `tech-stack.md` still records `deployment_target: cloudflare-pages`. The Worker name in `wrangler.jsonc` is "10x-astro-starter". Any AI agent drawing on pre-2025 tutorials will suggest `wrangler pages deploy` — running this creates a shadow Cloudflare Pages project rather than updating the Worker.

4. **100 MB maximum request body size (64 MB on Free).** High-resolution marketplace photos proxied directly through the Worker body will hit this ceiling. Images should flow via signed Supabase Storage URLs rather than transiting the Worker.

5. **KV is eventually consistent (up to 60s global propagation).** Using KV for transformation job status, session state, or any data requiring immediate post-write reads will cause intermittent cross-region bugs that do not reproduce in local dev.

### Pre-Mortem — How This Could Fail

The team deployed Omnilister AI to Cloudflare Workers in week one. `wrangler dev` was fast and local dev felt smooth. Three silent failures followed in production.

First failure: the image normalization step used an npm library with Node.js `Buffer` internals that the production workerd runtime did not support despite `nodejs_compat`. The failure surfaced only when a real user triggered a transformation — not in unit tests, not in `wrangler dev` (which polyfills APIs production does not). Debugging took four hours because `wrangler tail` was verbose and the actual exception was buried.

Second failure: high-resolution Otodom property photos exceeded the 100 MB body size limit. Workers returned a bare 413 with no helpful client-side error. The correct architecture — signed Supabase Storage URLs so images never transit the Worker body — was the right design all along but was not identified during the MVP sprint.

Third failure: one developer used `import.meta.env.AI_API_KEY` in a server route. It worked in local dev via `.dev.vars` and was silently `undefined` in production. Workers Secrets require access via `context.locals.runtime.env`, not `import.meta.env`. The AI transformation route failed for 48 hours after launch with no error surfaced to users.

Each failure was fixable in hours. None was catastrophic. But each consumed time the 3-week timeline did not have as slack.

### Unknown Unknowns

1. **`wrangler dev` and production workerd diverge on Node.js compatibility.** `wrangler dev` runs Miniflare locally and polyfills APIs the production runtime does not provide. Always test AI transformation routes with `wrangler dev --remote` against a staging Worker before treating them as production-ready.

2. **Workers Secrets ≠ `.env.local`.** Server routes must access secrets via `context.locals.runtime.env.SECRET_NAME`, not `import.meta.env`. Developers familiar with Vercel or Netlify will use the wrong pattern and get `undefined` in production only.

3. **Old tutorials and training data describe Cloudflare Pages, which is in maintenance mode for Astro 6.** Blog posts and community answers written before mid-2025 use `wrangler pages deploy`, `_routes.json`, and `pages_build_output_dir` — all wrong for Workers. Following them creates a shadow Pages project rather than deploying the Worker. The single correct deploy command is `npx wrangler deploy`.

4. **Image bytes transiting the Worker incur egress costs at scale.** With Supabase as storage and an external AI API doing the transformation, each image round-trips: Supabase → Worker → AI API → Worker → Supabase. Workers egress costs $0.09/GB beyond 5 GB free. At scale with large images, this accumulates unexpectedly.

5. **Script bundle size limit (10 MB compressed).** If AI client SDKs, large locale datasets, or wasm binaries are added as dependencies, the Worker bundle exceeds the compressed limit and the deploy fails with a script-size error. Run `npx wrangler deploy --dry-run` after adding any large dependency.

---

## Operational Story

- **Preview deploys**: No automatic per-PR preview URLs (unlike Cloudflare Pages). Create a second Worker named `omnilister-ai-preview` with a `[env.preview]` block in `wrangler.jsonc`. GitHub Actions deploys to it on PR open via `npx wrangler deploy --env preview`. Preview URLs are publicly accessible by default — add a Cloudflare Access rule to gate them if needed. Preview Workers do not inherit production CPU limits by default; set `cpu_ms` explicitly in the `[env.preview.limits]` block too.

- **Secrets**: Set via `npx wrangler secret put SECRET_NAME` — stored in Cloudflare's encrypted secrets store, never in `wrangler.jsonc` or committed to the repo. For local dev, use a `.dev.vars` file (gitignored). The agent can list secret names with `npx wrangler secret list` but cannot read values. Rotation: `npx wrangler secret put SECRET_NAME` with the new value; the Worker picks up the new value on the next request without a redeploy.

- **Rollback**: `npx wrangler rollback` reverts to the previous deployment (typical time: under 30 seconds, global propagation in ~1 minute). For a specific older version: list versions with `npx wrangler deployments list`, then `npx wrangler rollback [VERSION_ID]`. Database migrations do not roll back automatically — coordinate with Supabase migration state before issuing a Worker rollback.

- **Approval**: An agent may perform unattended: `npx wrangler deploy` (deploy to staging/preview Worker), `npx wrangler tail` (read-only live log stream), `npx wrangler secret put` (rotate a known secret value), `npx wrangler rollback` (revert to previous version). Human-only: production deploy to `omnilister-ai` (held via scoped API token the agent does not possess), Supabase database resets, Cloudflare account-level token rotation, billing plan changes, and Worker deletion.

- **Logs**: `npx wrangler tail` streams live production logs. Filter by error status: `npx wrangler tail --status error`. Filter by keyword: `npx wrangler tail --search "transformation"`. Format as JSON for structured parsing: `npx wrangler tail --format json`. The Cloudflare MCP server exposes `workers_logs_get_workersTail` for agent use.

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| workerd runtime incompatibility with Node.js native modules (e.g., sharp) | Devil's advocate | M | H | Audit all deps; replace native-binary packages; test with `npx wrangler dev --remote` before production |
| Image bytes proxied through Worker body exceed 100 MB limit | Devil's advocate | M | H | Route images via signed Supabase Storage URLs — images must never transit the Worker body |
| `import.meta.env` vs `context.locals.runtime.env` confusion for secrets | Unknown unknowns | H | M | Document access pattern in CLAUDE.md; treat `import.meta.env` as build-time only in server code |
| KV eventual consistency (up to 60s) causing stale post-write reads | Devil's advocate | M | M | Use D1 or Durable Objects for job-status and user-session data; reserve KV for stable config only |
| Stale Pages-oriented tutorials mislead AI agents (`wrangler pages deploy`) | Unknown unknowns | H | M | Pin `npx wrangler deploy` as the only allowed deploy command in CI; add `wrangler pages deploy` to AGENTS.md forbidden-commands list |
| Script bundle exceeds 10 MB compressed limit | Unknown unknowns | L | M | Run `npx wrangler deploy --dry-run` after each large dependency addition; monitor bundle size in CI |
| Paid plan not activated before first production deploy | Devil's advocate | M | L | Add Cloudflare billing activation as step 1 of the deploy checklist; Free plan 10ms CPU cap will fail all AI routes |
| Image egress cost surprises at scale | Unknown unknowns | L | M | Monitor Workers egress in Cloudflare dashboard; set billing alert at $50/month threshold |
| Worker name "10x-astro-starter" deployed to production unintentionally | Pre-mortem | M | L | Update `wrangler.jsonc` name to "omnilister-ai" before any production deploy |
| AI retry loop exhausts 1000-subrequest limit per request | Unknown unknowns | M | M | Implement max-2-retry with exponential backoff; surface the AI error to the user on retry exhaustion |

---

## Getting Started

1. **Upgrade to Cloudflare Workers Paid plan** at cloudflare.com → Account → Billing ($5/month). The Free plan's 10ms CPU cap fails all AI-integrated routes immediately. This must happen before any production deploy.

2. **Update `wrangler.jsonc` name and add CPU limits.** Change `"name": "10x-astro-starter"` to `"name": "omnilister-ai"`. Add a CPU time limit for AI routes:
   ```jsonc
   "limits": {
     "cpu_ms": 60000
   }
   ```
   Also update `context/foundation/tech-stack.md`: change `deployment_target` from `cloudflare-pages` to `cloudflare-workers`.

3. **Authenticate.** Run `npx wrangler login` — opens a browser OAuth flow. Create a scoped API token at cloudflare.com/profile/api-tokens with `Workers Scripts: Edit` permission scoped to the `omnilister-ai` Worker only. Store the production token as a GitHub repository secret; the agent holds only the staging/preview token.

4. **Set secrets.** For each environment variable (Supabase URL, Supabase anon key, AI API key):
   ```
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
   For local dev, copy `.env.example` to `.dev.vars` and populate it. Access secrets in server routes via `context.locals.runtime.env.SUPABASE_URL` — not `import.meta.env`.

5. **Build and deploy.** The existing `wrangler.jsonc` correctly points `main` to `@astrojs/cloudflare/entrypoints/server` and `assets.directory` to `./dist`. Deploy with:
   ```
   npm run build && npx wrangler deploy
   ```
   Verify the deploy with `npx wrangler tail` to stream live logs after the first request.

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions `wrangler deploy` workflow)
- Production-scale architecture (multi-region failover, SLA commitments, dedicated support tiers)
- Cloudflare Access configuration for preview URL protection
- AI provider selection and API contract details
