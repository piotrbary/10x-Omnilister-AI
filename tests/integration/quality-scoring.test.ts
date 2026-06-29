import { describe, it, expect } from "vitest";
import { scorePhoto } from "@/lib/quality-scoring";
import { aiConfig, scoringConfig } from "@/lib/config";

// Phase 2 — happy path goes REAL: a real (non-deterministic) OpenRouter vision call,
// so we assert contract INVARIANTS, never fixed numbers. Bounded by the minimal-cost
// vision model + a 1x1 PNG data URL. The deliberate-failure cases (forced 503 /
// malformed JSON / retry-exhaustion) stay mocked in src/lib/quality-scoring.test.ts —
// a real API can't be told to fail on command.

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const DIMENSIONS = [
  "sharpness",
  "lighting",
  "background",
  "object_features",
  "damage_defects",
  "labels",
  "angle_coverage",
  "sales_readiness",
] as const;

describe("scorePhoto — real OpenRouter contract invariants", () => {
  it("returns 8 in-range dimensions with a correctly-derived overall and sales-ready flag", async () => {
    const snapshot = await scorePhoto(TINY_PNG_DATA_URL, "item", aiConfig.previewModel);

    // All 8 dimensions are numbers in [0, 10].
    for (const dim of DIMENSIONS) {
      const v = snapshot[dim];
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(scoringConfig.maxScore);
    }

    // overall is the category-weighted mean of the returned dimensions (equal weights
    // for "item" → arithmetic mean, rounded to 2 dp — same formula as computeOverall).
    const weights = scoringConfig.categoryWeights.item;
    let weightedSum = 0;
    let totalWeight = 0;
    for (const dim of DIMENSIONS) {
      weightedSum += snapshot[dim] * weights[dim];
      totalWeight += weights[dim];
    }
    const expectedOverall = Math.round((weightedSum / totalWeight) * 100) / 100;
    expect(snapshot.overall).toBe(expectedOverall);

    // is_sales_ready is derived purely from overall vs the threshold.
    expect(snapshot.is_sales_ready).toBe(snapshot.overall >= scoringConfig.salesReadinessThreshold);
  }, 90_000);
});
