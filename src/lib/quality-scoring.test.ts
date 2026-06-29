import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
}));

import { scorePhoto } from "./quality-scoring";
import { aiConfig } from "./config";

// Deliberate-failure cases only. The happy-path math (overall computation, threshold)
// now runs as a REAL invariant check in tests/integration/quality-scoring.test.ts.
// These stay mocked because a real API can't be forced to return a 503 / malformed
// JSON / fail N times on command — and they keep feeding Stryker mutation on the
// retry logic.

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
      text: async () => "",
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
