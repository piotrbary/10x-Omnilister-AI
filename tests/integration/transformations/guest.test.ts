import { describe, it, expect } from "vitest";
import type { APIContext } from "astro";
import { POST } from "@/pages/api/transformations/guest";
import { aiConfig } from "@/lib/config";

// Risk #5 — the guest transform endpoint is unauthenticated by design and lets the
// caller pick the model with no rate/size limit. These tests assert that abuse
// surface against a REAL OpenRouter call, bounded by the minimal-cost image-native
// model + a 1x1 PNG so spend is negligible. No Supabase, no mocks.

// A small (32x32) but REAL gradient PNG — a 1x1 is too degenerate for the image
// model (intermittently returns no image → 500). Small enough that spend stays
// negligible, real enough that generation is reliable.
const TINY_PNG_BASE64 =
  "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";

// Minimal-cost image-capable model (image input → image output, single call).
const MIN_COST_IMAGE_MODEL = aiConfig.transformationModel;

function makeContext(body: unknown): APIContext {
  const request = new Request("http://localhost/api/transformations/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The handler only reads context.request.json(); the rest of APIContext is irrelevant here.
  return { request } as unknown as APIContext;
}

describe("guest transform endpoint — Risk #5 cost boundary", () => {
  it("runs unauthenticated with a caller-chosen model and returns a result", async () => {
    const res = await POST(
      makeContext({
        imageBase64: TINY_PNG_BASE64,
        mimeType: "image/png",
        style_name: "studio",
        model: MIN_COST_IMAGE_MODEL,
      }),
    );

    const data = (await res.json()) as { result_base64?: string; error?: string };
    // Surface the upstream error in the failure message if the call didn't 200.
    expect(res.status, `response body: ${JSON.stringify(data).slice(0, 500)}`).toBe(200);
    // Proves the paid pipeline is reachable with no session — the open boundary.
    expect(typeof data.result_base64).toBe("string");
    expect((data.result_base64 ?? "").length).toBeGreaterThan(0);
  }, 90_000);

  it("returns 400 when a required field is missing (no model call)", async () => {
    const res = await POST(
      makeContext({ mimeType: "image/png", style_name: "studio" }), // imageBase64 missing
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/imageBase64/);
  });
});
