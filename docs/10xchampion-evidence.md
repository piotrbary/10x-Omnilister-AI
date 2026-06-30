# 10xChampion — CI/CD Code Review Evidence

Scope: **Pipeline CI/CD do review kodu (M5L2–L3)** only. (M5L4 artifact registry
not in scope for this submission.)

Repo: https://github.com/piotrbary/10x-Omnilister-AI
App: https://omnilister-ai.peter-be-cloud.workers.dev/

## How the flow works

`.github/workflows/review.yaml` ("AI Code Review") runs on every PR to `main`.
A Node 24 job runs `packages/code-reviewer` — a Vercel AI SDK + OpenRouter agent
that diffs the PR against the base branch, reviews it with `gpt-4o-mini`,
escalates suspected `critical` findings to `gpt-4o`, then **posts the findings
back onto the PR as a comment** (`pull-requests: write`) and fails the job if a
critical finding survives.

## Evidence (screenshots to attach)

| # | Requirement | Where | URL |
|---|-------------|-------|-----|
| 1 | Pipeline view with ≥1 visible job | Actions → AI Code Review → run → `review` job | https://github.com/piotrbary/10x-Omnilister-AI/actions/workflows/review.yaml |
| 2 | Logs from the job during code review | "Run agent" step log (shows model, escalation, findings) | https://github.com/piotrbary/10x-Omnilister-AI/actions/runs/28439970477/job/84275162798 |
| 3 | Action on a PR + code-review comment from the agent | PR #12 comment by `github-actions` | https://github.com/piotrbary/10x-Omnilister-AI/pull/12#issuecomment-4842744905 |

Screenshot tips:
- **#1** — expand the run so the `review` job and its steps are visible.
- **#2** — open the **Run agent** step; capture the lines `Reviewing diff with
  model: openai/gpt-4o-mini`, the escalation line, and the `[critical]`/`[major]`
  findings. (The `Enforce review verdict` step exiting 1 is correct — the agent
  blocked a PR with a real bug.)
- **#3** — capture the `🤖 AI Code Review` comment body on PR #12.

## Baserow form answers (Champion track)

- **Badge / odznaka:** 10xChampion
- **Track:** Champion (zrzuty ekranu)
- **Repo URL:** https://github.com/piotrbary/10x-Omnilister-AI
- **Demo app URL:** https://omnilister-ai.peter-be-cloud.workers.dev/
- **CI/CD code-review pipeline:** GitHub Actions workflow `AI Code Review`
  (`.github/workflows/review.yaml`); agent in `packages/code-reviewer`
  (Vercel AI SDK v6 + OpenRouter, structured output via Zod).
- **Upload:** the 3 screenshots above (pipeline+job, job logs, PR comment).

## Reproduce / refresh the evidence

Demo PR #12 is left open on purpose. To regenerate:

```bash
gh pr comment 12 --edit-last   # or re-run the workflow:
gh workflow run "AI Code Review" --ref demo/ai-review-showcase
```

Close it once screenshots are captured: `gh pr close 12 --delete-branch`.
