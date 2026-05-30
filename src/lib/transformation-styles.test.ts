import { describe, it, expect } from "vitest";
import { buildPrompt } from "./transformation-styles";

const GUARDRAIL =
  "IMPORTANT: Do NOT add, remove, or alter any actual features, markings, or characteristics of the product. Only improve the photographic presentation.";

describe("buildPrompt", () => {
  it("always appends the no-distortion guardrail", () => {
    const result = buildPrompt("showroom", undefined);
    expect(result).toContain(GUARDRAIL);
  });

  it("concatenates custom override with base prompt when provided", () => {
    const result = buildPrompt("showroom", "extra instruction");
    expect(result).toContain("Professional dealership showroom");
    expect(result).toContain("extra instruction");
    expect(result).toContain(GUARDRAIL);
  });
});
