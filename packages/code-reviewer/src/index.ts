/**
 * Code Reviewer — entry point.
 *
 * Thin, reusable base for further integrations on top of the Vercel AI SDK
 * (`ai@6`) routed through OpenRouter. Everything here is exported so other
 * modules can import the configured provider, the schema, and `reviewCode()`
 * without re-wiring the SDK.
 *
 * NOTE: pinned to AI SDK v6 because the OpenRouter provider (`2.10.0`, the
 * current `latest`) peers `ai@^6`; no stable OpenRouter release targets v7 yet.
 */
import { execSync } from 'node:child_process';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, Output } from 'ai';
import { z } from 'zod';

/** OpenRouter is the single AI gateway for this project (one key for all calls). */
function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key ' +
        '(get one at https://openrouter.ai/keys).',
    );
  }
  return apiKey;
}

/**
 * Lazily-built OpenRouter provider. Built on first use so that importing this
 * module for its types/schema alone never requires an API key.
 */
let provider: ReturnType<typeof createOpenRouter> | undefined;
export function openrouter(model: string) {
  provider ??= createOpenRouter({ apiKey: requireApiKey() });
  return provider(model);
}

/** Default model; override with OPENROUTER_MODEL (any OpenRouter model id). */
export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

/** Schema for a single review finding. */
export const reviewFindingSchema = z.object({
  severity: z.enum(['info', 'minor', 'major', 'critical']),
  line: z.number().int().nullable().describe('1-based line number, or null if not line-specific'),
  message: z.string().describe('What is wrong'),
  suggestion: z.string().describe('Concrete fix'),
});

/** Schema for a full code review — the structured output contract. */
export const reviewSchema = z.object({
  summary: z.string().describe('One-paragraph overall assessment'),
  findings: z.array(reviewFindingSchema),
  approved: z.boolean().describe('True if the change is safe to merge as-is'),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type CodeReview = z.infer<typeof reviewSchema>;

export interface ReviewOptions {
  /** OpenRouter model id; defaults to DEFAULT_MODEL. */
  model?: string;
  /** Optional language hint (e.g. "typescript") to sharpen the review. */
  language?: string;
}

/**
 * Review a snippet of code and return a typed, schema-validated result.
 *
 * Built on `generateText` + `Output.object` (the v6 structured-output API),
 * so callers get a fully typed `CodeReview` back — no manual JSON parsing.
 */
export async function reviewCode(code: string, options: ReviewOptions = {}): Promise<CodeReview> {
  const { model = DEFAULT_MODEL, language } = options;

  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: reviewSchema }),
    system:
      'You are a meticulous senior code reviewer. Flag correctness bugs, security ' +
      'issues, and clear design problems. Be specific and actionable; do not nitpick style.',
    prompt: [
      language ? `Language: ${language}` : null,
      'Review the following code and return findings:',
      '```',
      code,
      '```',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  return output;
}

/**
 * Diff to review: changes between the base ref's merge-base and HEAD.
 * DIFF_BASE is set by CI (e.g. `origin/main`); locally it falls back to the
 * working-tree diff against HEAD so `npm start` reviews your uncommitted work.
 */
function getDiff(): string {
  const base = process.env.DIFF_BASE;
  const cmd = base ? `git diff ${base}...HEAD` : 'git diff HEAD';
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

/**
 * ~60k tokens of input. Diffs are token-dense (~2.5 chars/token, not 4), and the
 * model reserves ~16k tokens for completion — so this stays well under a 128k window.
 */
const MAX_CHUNK_CHARS = 150_000;

/**
 * Split a diff into review chunks, each under MAX_CHUNK_CHARS. Files (sections
 * starting with `diff --git`) are packed greedily so small files share a call.
 * ponytail: a single file larger than the budget is truncated, not split mid-
 * hunk — fine for review; split per-hunk only if huge single files become common.
 */
function chunkDiff(diff: string): string[] {
  const files = diff.split(/(?=^diff --git )/m).filter((p) => p.trim());
  const chunks: string[] = [];
  let current = '';
  for (const file of files) {
    const piece = file.length > MAX_CHUNK_CHARS ? file.slice(0, MAX_CHUNK_CHARS) : file;
    if (current && current.length + piece.length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current += piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** `npm start`: review the current diff (chunked if large) and print findings. */
async function main(): Promise<void> {
  const diff = getDiff();
  if (!diff) {
    console.log('No changes to review.');
    return;
  }

  const chunks = chunkDiff(diff);
  console.log(
    `Reviewing diff with model: ${DEFAULT_MODEL}` +
      (chunks.length > 1 ? ` (${chunks.length} chunks)` : '') +
      '\n',
  );

  let approved = true;
  for (const [i, chunk] of chunks.entries()) {
    if (chunks.length > 1) console.log(`--- chunk ${i + 1}/${chunks.length} ---`);
    const review = await reviewCode(chunk, { language: 'diff' });
    approved &&= review.approved;

    console.log(`Summary: ${review.summary}`);
    console.log(`Approved: ${review.approved}\n`);
    for (const f of review.findings) {
      const where = f.line === null ? 'general' : `line ${f.line}`;
      console.log(`[${f.severity}] (${where}) ${f.message}\n  → ${f.suggestion}`);
    }
  }

  // Block the PR when any chunk is unsafe to merge as-is.
  if (!approved) process.exitCode = 1;
}

// Run only when executed directly (Node 24 `import.meta.main`), not when imported.
if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
