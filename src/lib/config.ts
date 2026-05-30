// Application-level constants. Edit here; do not scatter magic numbers across the codebase.

export const storageConfig = {
  /** Maximum total storage per client account (original + transformed photos combined). */
  Max_Client_Repository: 100 * 1024 * 1024, // 100 MB in bytes

  /** Human-readable label shown in UI and error messages. */
  Max_Client_Repository_Label: "100 MB",

  /** Allowed MIME types for photo uploads. */
  allowedPhotoMimeTypes: ["image/jpeg", "image/png", "image/webp"],

  /** Maximum size of a single uploaded photo (10 MB). */
  maxSinglePhotoBytes: 10 * 1024 * 1024,
} as const;

export const aiConfig = {
  /**
   * OpenAI API must be called with zero-data-retention headers where supported.
   * Photos sent to OpenAI are processed in-memory only — OpenAI must not persist
   * them after the API response is returned. Verify via OpenAI Enterprise ZDR policy.
   */
  openaiZeroDataRetention: true,

  /** Timeout for full AI transformation response (ms). Matches NFR ≤ 60 s. */
  transformationTimeoutMs: 60_000,

  /** Timeout for draft/low-res preview response (ms). Matches NFR ≤ 5 s. */
  draftPreviewTimeoutMs: 5_000,

  /** Maximum retries on transient OpenAI API errors before surfacing to user. */
  maxRetries: 2,
} as const;

export const scoringConfig = {
  /**
   * Minimum quality score threshold for "sales readiness" across all categories.
   * Score ≥ salesReadinessThreshold → labelled "ready to publish".
   * Score < salesReadinessThreshold → labelled "needs improvement".
   * Interpretation: 7/10 = at least 70 % of each metric dimension satisfied
   * (good lighting, sharp details, professional background, accurate product representation).
   */
  salesReadinessThreshold: 7,

  /** Score scale upper bound. */
  maxScore: 10,

  /** Object categories used for category-specific scoring models. */
  categories: ["car", "real-estate", "item"] as const,
} as const;

export type ObjectCategory = (typeof scoringConfig.categories)[number];
