// Application-level constants. Edit here; do not scatter magic numbers across the codebase.

export const storageConfig = {
  /**
   * Maximum total storage per client account (original + transformed photos combined).
   * WARNING: Changing this value requires a new Supabase migration to update the
   * `storage_limit` CHECK constraint on the `profiles` table. See docs/reference/contract-surfaces.md.
   */
  Max_Client_Repository: 100 * 1024 * 1024, // 100 MB in bytes

  /** Human-readable label shown in UI and error messages. */
  Max_Client_Repository_Label: "100 MB",

  /** Allowed MIME types for photo uploads. */
  allowedPhotoMimeTypes: ["image/jpeg", "image/png", "image/webp"],

  /** Maximum size of a single uploaded photo (10 MB). */
  maxSinglePhotoBytes: 10 * 1024 * 1024,

  /** Maximum number of photos allowed per object. */
  maxPhotosPerObject: 10,
} as const;

export const aiConfig = {
  /**
   * AI requests are routed through OpenRouter (https://openrouter.ai/api/v1).
   * Model names use the OpenRouter provider-prefix format: "openai/gpt-image-1".
   * API key: OPENROUTER_API_KEY (Workers Secret / .dev.vars).
   * Data handling: photos are forwarded to the underlying model provider by OpenRouter.
   * Zero-data-retention must be negotiated per the underlying provider's policy.
   */
  provider: "openrouter" as const,
  baseUrl: "https://openrouter.ai/api/v1",

  /** OpenRouter model ID for full-quality image editing. */
  transformationModel: "openai/gpt-image-1",

  /** Timeout for full AI transformation response (ms). Matches NFR ≤ 60 s. */
  transformationTimeoutMs: 60_000,

  /** Timeout for draft/low-res preview response (ms). Matches NFR ≤ 5 s. */
  draftPreviewTimeoutMs: 5_000,

  /** Maximum retries on transient API errors before surfacing to user. */
  maxRetries: 2,

  /** OpenRouter model ID for GPT-4o Vision used in photo quality scoring (S-02). */
  visionModel: "openai/gpt-4o",
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

  /**
   * Per-category dimension weights for overall score calculation.
   * All dimensions currently equal weight (1/8 = 0.125).
   * Calibrate per category before public launch.
   */
  categoryWeights: {
    car:           { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
    "real-estate": { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
    item:          { sharpness:1, lighting:1, background:1, object_features:1, damage_defects:1, labels:1, angle_coverage:1, sales_readiness:1 },
  },
} as const;

export type ObjectCategory = (typeof scoringConfig.categories)[number];
