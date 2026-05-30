import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
}));

import { scorePhoto } from "./quality-scoring";
import { aiConfig, scoringConfig } from "./config";

function makeGptResponse(scores: Record<string, number>, category = "car", features_text = "Test object.") {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ category, features_text, scores }),
        },
      },
    ],
  };
}

describe("scorePhoto — overall computation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("computes overall as arithmetic mean of 8 equal-weight dimensions, rounded to 2 dp", async () => {
    // sum = 8+7+6+9+5+8+7+6 = 56, mean = 7.00
    const scores = { sharpness:8, lighting:7, background:6, object_features:9, damage_defects:5, labels:8, angle_coverage:7, sales_readiness:6 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makeGptResponse(scores),
    } as unknown as Response);

    const snapshot = await scorePhoto("https://example.com/photo.jpg", "car");
    expect(snapshot.overall).toBe(7.00);
    expect(snapshot.sharpness).toBe(8);
    expect(snapshot.lighting).toBe(7);
  });

  it("rounds overall to 2 decimal places", async () => {
    // sum = 55, mean = 6.875 → rounded to 6.88
    const scores = { sharpness:7, lighting:7, background:7, object_features:6, damage_defects:7, labels:7, angle_coverage:7, sales_readiness:7 };
    // Wait: sum = 7*7+6 = 49+6 = 55. mean = 55/8 = 6.875 → Math.round(6.875*100)/100 = 6.88
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makeGptResponse(scores),
    } as unknown as Response);

    const snapshot = await scorePhoto("https://example.com/photo.jpg", "car");
    expect(snapshot.overall).toBe(6.88);
  });
});

describe("scorePhoto — is_sales_ready threshold", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is_sales_ready = true when overall >= salesReadinessThreshold", async () => {
    // All scores = 7 → overall = 7.00 ≥ 7
    const scores = { sharpness:7, lighting:7, background:7, object_features:7, damage_defects:7, labels:7, angle_coverage:7, sales_readiness:7 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makeGptResponse(scores),
    } as unknown as Response);

    const snapshot = await scorePhoto("https://example.com/photo.jpg", "car");
    expect(snapshot.overall).toBe(scoringConfig.salesReadinessThreshold);
    expect(snapshot.is_sales_ready).toBe(true);
  });

  it("is_sales_ready = false when overall < salesReadinessThreshold", async () => {
    // sum = 54, mean = 6.75 < 7
    const scores = { sharpness:7, lighting:7, background:7, object_features:6, damage_defects:7, labels:7, angle_coverage:7, sales_readiness:6 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makeGptResponse(scores),
    } as unknown as Response);

    const snapshot = await scorePhoto("https://example.com/photo.jpg", "car");
    expect(snapshot.overall).toBe(6.75);
    expect(snapshot.is_sales_ready).toBe(false);
  });
});

describe("scorePhoto — retry behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retries on fetch rejection and throws after maxRetries exhausted", async () => {
    const networkError = new Error("Network error");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(networkError);

    await expect(scorePhoto("https://example.com/photo.jpg", "car")).rejects.toThrow("Network error");

    // Should have been called maxRetries + 1 times total (initial + retries)
    expect(fetchSpy).toHaveBeenCalledTimes(aiConfig.maxRetries + 1);
  });

  it("retries on non-ok HTTP response and throws after maxRetries exhausted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as unknown as Response);

    await expect(scorePhoto("https://example.com/photo.jpg", "car")).rejects.toThrow("503");

    expect(fetchSpy).toHaveBeenCalledTimes(aiConfig.maxRetries + 1);
  });

  it("succeeds on second attempt after first fetch rejection", async () => {
    const scores = { sharpness:8, lighting:8, background:8, object_features:8, damage_defects:8, labels:8, angle_coverage:8, sales_readiness:8 };
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Transient error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeGptResponse(scores),
      } as unknown as Response);

    const snapshot = await scorePhoto("https://example.com/photo.jpg", "car");
    expect(snapshot.overall).toBe(8);
  });
});

describe("scorePhoto — malformed JSON retry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retries when GPT returns malformed JSON and throws after exhausting retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "this is not valid json {{{" } }],
      }),
    } as unknown as Response);

    await expect(scorePhoto("https://example.com/photo.jpg", "car")).rejects.toThrow(/Malformed JSON/);

    expect(fetchSpy).toHaveBeenCalledTimes(aiConfig.maxRetries + 1);
  });

  it("retries when GPT returns empty content and throws", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    } as unknown as Response);

    await expect(scorePhoto("https://example.com/photo.jpg", "car")).rejects.toThrow(/Empty content/);
  });
});
