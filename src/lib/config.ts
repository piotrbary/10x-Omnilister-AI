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

export const TRANSFORMATION_MODELS: { id: string; label: string; supportsImageOutput: boolean }[] = [
  // Direct image generation (image input → image output)
  { id: "google/gemini-2.5-flash-image",         label: "Gemini 2.5 Flash Image",         supportsImageOutput: true },
  { id: "google/gemini-3.1-flash-image",         label: "Gemini 3.1 Flash Image",         supportsImageOutput: true },
  { id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image Preview", supportsImageOutput: true },
  { id: "google/gemini-3-pro-image",             label: "Gemini 3 Pro Image",             supportsImageOutput: true },
  { id: "openai/gpt-5-image-mini",               label: "GPT-5 Image Mini",               supportsImageOutput: true },
  { id: "openai/gpt-5-image",                    label: "GPT-5 Image",                    supportsImageOutput: true },
  { id: "openai/gpt-5.4-image-2",                label: "GPT-5.4 Image 2",                supportsImageOutput: true },

  // Prompt-enhancement models (step 1 of 2-step flow; Gemini 2.5 Flash generates the image in step 2)
  { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (mini)", supportsImageOutput: false },
  { id: "anthropic/claude-sonnet-4-6",         label: "Claude Sonnet 4.6",       supportsImageOutput: false },
  { id: "anthropic/claude-opus-4-8",           label: "Claude Opus 4.8 (pro)",   supportsImageOutput: false },
  { id: "openai/gpt-4o-mini",                  label: "GPT-4o mini",             supportsImageOutput: false },
  { id: "openai/gpt-4o",                       label: "GPT-4o",                  supportsImageOutput: false },
  { id: "openai/o3-mini",                      label: "o3-mini",                 supportsImageOutput: false },
  { id: "openai/o3",                           label: "o3",                      supportsImageOutput: false },
  { id: "google/gemini-2.0-flash-001",         label: "Gemini 2.0 Flash (mini)", supportsImageOutput: false },
  { id: "google/gemini-2.5-flash",             label: "Gemini 2.5 Flash",        supportsImageOutput: false },
  { id: "google/gemini-2.5-pro",               label: "Gemini 2.5 Pro",          supportsImageOutput: false },
];

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

  /** OpenRouter model ID for full-quality image generation (image+text → image). */
  transformationModel: "google/gemini-2.5-flash-image",

  /** Timeout for full AI transformation response (ms). Matches NFR ≤ 60 s. */
  transformationTimeoutMs: 60_000,

  /** Timeout for draft/low-res preview response (ms). Matches NFR ≤ 5 s. */
  draftPreviewTimeoutMs: 5_000,

  /** Maximum retries on transient API errors before surfacing to user. */
  maxRetries: 2,

  /**
   * Cap on completion tokens per OpenRouter chat request. Bounds the upfront
   * credit reservation (OpenRouter pre-authorizes the model's full output ceiling
   * otherwise) and the per-call cost. The vision JSON score and the enhanced
   * prompt are both well under this; image output is billed separately.
   */
  maxOutputTokens: 1024,

  /** OpenRouter model ID for GPT-4o Vision used in photo quality scoring (S-02). */
  visionModel: "openai/gpt-4o",

  /** Cheap vision model for on-demand scoreBefore preview in EditorShell. */
  previewModel: "openai/gpt-4o-mini",
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
