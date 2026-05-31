import { OPENROUTER_API_KEY } from "astro:env/server";
import { aiConfig } from "./config";

const DRAFT_MODEL = "openai/dall-e-2";
const DRAFT_SIZE = "256x256";
const FULL_SIZE = "1024x1024";

async function callImageEdit(
  imageData: Uint8Array,
  mimeType: string,
  prompt: string,
  model: string,
  size: string,
): Promise<Uint8Array> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= aiConfig.maxRetries; attempt++) {
    try {
      const formData = new FormData();
      formData.append("image", new Blob([imageData.buffer as ArrayBuffer], { type: mimeType }), "image.jpg");
      formData.append("prompt", prompt);
      formData.append("n", "1");
      formData.append("size", size);
      formData.append("response_format", "b64_json");
      formData.append("model", model);

      const response = await fetch(`${aiConfig.baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}` },
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as { data: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image data in OpenRouter response");

      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Draft uses dall-e-2 at 256x256 — gpt-image-1 has no sub-1024 size option.
export async function generateDraft(
  imageBuffer: Uint8Array,
  prompt: string,
  mimeType: string,
): Promise<{ url: string; buffer: Uint8Array }> {
  const buffer = await callImageEdit(imageBuffer, mimeType, prompt, DRAFT_MODEL, DRAFT_SIZE);
  return { url: "", buffer };
}

export async function generateFull(
  imageBuffer: Uint8Array,
  prompt: string,
  mimeType: string,
): Promise<{ url: string; buffer: Uint8Array }> {
  const buffer = await callImageEdit(
    imageBuffer,
    mimeType,
    prompt,
    aiConfig.transformationModel,
    FULL_SIZE,
  );
  return { url: "", buffer };
}
