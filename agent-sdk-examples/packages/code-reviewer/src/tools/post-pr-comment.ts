import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { ReviewResult } from "../schemas/review.js";
import { PlanReviewResult } from "../schemas/plan-review.js";
import { renderCodeReviewComment, renderPlanReviewComment } from "../render/comment.js";
import { detectGitHubEnv } from "./github-env.js";
import { trace } from "../log.js";

/**
 * The `postPrComment` tool: render a structured review payload into the
 * deterministic markdown body (Phase 3), then post it as a fresh PR comment via
 * `gh`. Posting is gated on a resolvable PR number (`PR_NUMBER`) — NOT on being
 * inside GitHub Actions — so a local run with `PR_NUMBER` set (and `gh` authed)
 * posts for real. The rendered body is ALWAYS written to stderr first, so every
 * run is observable whether or not it posts; with no PR target it logs only.
 *
 * The model supplies only the structured scores/rationale; the layout is
 * rendered in-code, and the diff-truncation note is read from `DIFF_TRUNCATED`
 * in the environment — never from the model-facing input schema.
 */

/** Result of a posting attempt. */
export type PostResult =
  | { posted: true; kind: "code" | "plan" }
  | { posted: false; reason: string; kind: "code" | "plan" };

/**
 * Post a comment body to a PR via `gh`, passing the body by file (not inline) to
 * avoid arg-size and shell-escaping limits — mirroring the diff-via-stdin
 * rationale in `cli.ts`. Extracted so the exec boundary is mockable in tests.
 */
export function postCommentViaGh(prNumber: string, body: string): void {
  const bodyFile = path.join(tmpdir(), `ai-cr-comment-${prNumber}-${process.pid}.md`);
  writeFileSync(bodyFile, body, "utf8");
  trace(`tool postPrComment · running: gh pr comment ${prNumber} --body-file ${bodyFile}`);
  // `gh pr comment` prints the new comment's URL to *its* stdout. The CI step
  // running us redirects our stdout into the result JSON file (`{ verdict }`),
  // so letting gh inherit fd 1 corrupts that JSON (`JSON.parse` then fails on
  // the leading `https://…`). Route gh's stdout to our stderr (fd 2) instead:
  // the URL stays visible in CI logs but never reaches the result file. stdin
  // is ignored; stderr is inherited as before.
  execFileSync("gh", ["pr", "comment", prNumber, "--body-file", bodyFile], {
    stdio: ["ignore", 2, "inherit"],
  });
}

/** Render the markdown body for a given payload, reading the truncation flag from env. */
function renderBody(
  payload: { kind: "code"; review: ReviewResult } | { kind: "plan"; review: PlanReviewResult }
): string {
  if (payload.kind === "code") {
    const truncated = process.env.DIFF_TRUNCATED === "true";
    return renderCodeReviewComment(payload.review, { truncated });
  }
  return renderPlanReviewComment(payload.review);
}

export const postPrCommentTool = tool({
  description:
    "Post a code-review or implementation-review comment to the pull request under review. The " +
    "implementation review (kind: 'plan') judges the diff against the plan it implements — it is " +
    "NOT a review of the plan itself. Provide the structured review payload; the comment markdown " +
    "is rendered deterministically. Call once for the code review, and once more for the " +
    "implementation review when a plan was loaded.",
  inputSchema: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("code").describe("A six-criteria code review."),
      review: ReviewResult,
    }),
    z.object({
      kind: z.literal("plan").describe("An implementation review: the diff judged against its plan."),
      review: PlanReviewResult,
    }),
  ]),
  execute: async (payload): Promise<PostResult> => {
    trace(`tool postPrComment · rendering ${payload.kind} review comment`);
    const body = renderBody(payload);
    const env = detectGitHubEnv();
    // Resolve the target PR independently of CI: posting works wherever a PR
    // number is available (GitHub Actions or a local run with PR_NUMBER set),
    // not only inside GitHub Actions.
    const prNumber = env.prNumber ?? process.env.PR_NUMBER?.trim();
    trace(
      `tool postPrComment · rendered ${body.length} chars · ` +
        `inGitHub=${env.inGitHub} · pr=${prNumber ?? "—"}`
    );

    // Always log the rendered comment first: locally it's the visible artifact of
    // the run; in CI it mirrors what was posted into the job log.
    const target = prNumber ? `posting to PR #${prNumber}` : "no PR target — not posting";
    process.stderr.write(`\n--- ${payload.kind} review comment (${target}) ---\n`);
    process.stderr.write(`${body}\n`);

    if (!prNumber) {
      trace(`tool postPrComment · no PR number — logged ${payload.kind} comment, not posting`);
      return { posted: false, reason: "no-pr-number", kind: payload.kind };
    }

    postCommentViaGh(prNumber, body);
    trace(`tool postPrComment · posted ${payload.kind} comment to PR #${prNumber}`);
    return { posted: true, kind: payload.kind };
  },
});
