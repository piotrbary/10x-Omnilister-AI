import { OPENROUTER_API_KEY } from "astro:env/server";
import { aiConfig, TRANSFORMATION_MODELS } from "./config";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Step 1 of the two-step flow: sends the image + style prompt to a vision/text model
 * and asks it to generate an optimized image-generation prompt.
 */
async function enhancePrompt(
  dataUrl: string,
  stylePrompt: string,
  model: string,
  logs: string[],
): Promise<string> {
  logs.push(`[enhance] POST ${aiConfig.baseUrl}/chat/completions model=${model}`);

  const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            {
              type: "text",
              text: `You are an expert prompt engineer for AI image generation, specialising in professional e-commerce product photography.

Analyse this product photo carefully. Write a single, optimised image-generation prompt that will transform it according to this style requirement:

"${stylePrompt}"

Rules:
- Return ONLY the prompt text — no preamble, no explanations, no quotes around it.
- Be specific and vivid: describe lighting, background, composition, colours, shadows, and photographic style.
- The prompt should work with a vision-input image-generation model (the original image will be provided alongside your prompt).
- Maximum 300 words.`,
            },
          ],
        },
      ],
    }),
  });

  logs.push(`[enhance] response status=${res.status}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logs.push(`[enhance] ERROR_BODY=${text.slice(0, 300)}`);
    throw new Error(`Prompt enhancement failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const enhanced = data.choices?.[0]?.message?.content?.trim() ?? stylePrompt;
  logs.push(`[enhance] result preview: "${enhanced.slice(0, 120)}…"`);
  return enhanced;
}

/**
 * Step 2 (and the only step for image-native models): sends the original image + prompt
 * to an image-generation model and returns the decoded result buffer.
 */
async function generateImage(
  dataUrl: string,
  prompt: string,
  imageModel: string,
  logs: string[],
): Promise<Uint8Array> {
  const keyPreview = (OPENROUTER_API_KEY ?? "").slice(0, 8) || "(missing)";
  logs.push(`[image] POST ${aiConfig.baseUrl}/chat/completions model=${imageModel} key=${keyPreview}...`);

  const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            {
              type: "text",
              text: `Professional e-commerce product photo. Style and requirements: ${prompt}`,
            },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  logs.push(`[image] response status=${res.status}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logs.push(`[image] ERROR_BODY=${text.slice(0, 500)}`);
    throw new Error(`Image generation failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  type ImageChoice = {
    message: {
      content?: string;
      images?: Array<{ image_url?: { url?: string } }>;
    };
  };
  const data = (await res.json()) as { choices: ImageChoice[] };
  const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  logs.push(`[image] image_present=${!!imageDataUrl} preview="${imageDataUrl?.slice(0, 40)}…"`);

  if (!imageDataUrl) throw new Error("No image in model response");

  const base64 = imageDataUrl.includes(",") ? imageDataUrl.split(",")[1]! : imageDataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  logs.push(`[image] SUCCESS decoded_bytes=${bytes.byteLength}`);
  return bytes;
}

/**
 * Public entry point for transformation.
 *
 * - Image-native model selected → single step: model receives image + prompt → returns image.
 * - Text/vision model selected  → two-step: model enhances the prompt → Gemini generates image.
 */
export async function generateFull(
  imageBuffer: Uint8Array,
  prompt: string,
  mimeType: string,
  logs: string[] = [],
  model: string = aiConfig.transformationModel,
): Promise<{ url: string; buffer: Uint8Array }> {
  const modelDef = TRANSFORMATION_MODELS.find((m) => m.id === model);
  const supportsImageOutput = modelDef?.supportsImageOutput ?? false;

  // Convert once — reused by both steps to avoid double CPU cost
  const dataUrl = `data:${mimeType};base64,${uint8ArrayToBase64(imageBuffer)}`;
  logs.push(`[generate] base64 encoded bytes=${imageBuffer.byteLength}`);

  let effectivePrompt = prompt;
  const imageModel = supportsImageOutput ? model : aiConfig.transformationModel;

  if (!supportsImageOutput) {
    logs.push(`[generate] Two-step flow: ${model} (enhance) → ${imageModel} (generate)`);
    effectivePrompt = await enhancePrompt(dataUrl, prompt, model, logs);
  } else {
    logs.push(`[generate] Direct flow: ${model}`);
  }

  const buffer = await generateImage(dataUrl, effectivePrompt, imageModel, logs);
  return { url: "", buffer };
}
