import type { ObjectCategory } from "@/lib/config";

const NO_DISTORTION_GUARDRAIL =
  "IMPORTANT: Do NOT add, remove, or alter any actual features, markings, or characteristics of the product. Only improve the photographic presentation.";

interface PresetStyle {
  key: string;
  label: string;
  description: string;
  basePrompt: string;
}

export const PRESET_STYLES: Record<ObjectCategory, PresetStyle[]> = {
  car: [
    {
      key: "showroom",
      label: "Showroom",
      description: "Professional dealership showroom look",
      basePrompt:
        "Professional dealership showroom, neutral floor, even studio lighting",
    },
    {
      key: "outdoor-clean",
      label: "Outdoor Clean",
      description: "Clean outdoor setting with natural light",
      basePrompt:
        "Clean outdoor setting, neutral empty background, natural daylight",
    },
    {
      key: "white-studio",
      label: "White Studio",
      description: "Pure white seamless studio background",
      basePrompt:
        "Pure white seamless background, professional studio lighting",
    },
  ],
  "real-estate": [
    {
      key: "bright-interior",
      label: "Bright Interior",
      description: "Maximized natural light and brightness",
      basePrompt:
        "Maximize natural light and brightness; clear bright sky visible through windows; clean uncluttered appearance",
    },
    {
      key: "twilight-exterior",
      label: "Twilight Exterior",
      description: "Warm golden-hour exterior lighting",
      basePrompt:
        "Warm golden-hour lighting, well-lit façade, clear sky",
    },
    {
      key: "clean-professional",
      label: "Clean Professional",
      description: "Balanced professional real estate photography",
      basePrompt:
        "Balanced professional real estate photography exposure, crisp architectural details",
    },
  ],
  item: [
    {
      key: "white-background",
      label: "White Background",
      description: "Pure white seamless product background",
      basePrompt:
        "Pure white seamless background, even multi-angle studio lighting, no props",
    },
    {
      key: "neutral-background",
      label: "Neutral Background",
      description: "Soft neutral gray professional background",
      basePrompt:
        "Soft neutral gray background, professional product photography, no harsh shadows",
    },
    {
      key: "lifestyle-context",
      label: "Lifestyle Context",
      description: "Natural lifestyle photography context",
      basePrompt:
        "Natural lifestyle photography context, item as focal point",
    },
  ],
};

export function buildPrompt(styleKey: string, customOverride?: string): string {
  const allStyles = Object.values(PRESET_STYLES).flat();
  const style = allStyles.find((s) => s.key === styleKey);
  const base = style?.basePrompt ?? styleKey;

  const parts = [base];
  if (customOverride) {
    parts.push(customOverride);
  }
  parts.push(NO_DISTORTION_GUARDRAIL);

  return parts.join(" ");
}
