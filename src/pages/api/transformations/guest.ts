import type { APIRoute } from "astro";
import { buildPrompt } from "@/lib/transformation-styles";
import { generateFull } from "@/lib/openrouter-images";
import { aiConfig } from "@/lib/config";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 32768;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ponytail: no auth check — unauthenticated transforms. Add IP rate limiting if abuse occurs.
export const POST: APIRoute = async (context) => {
  try {
    const body = (await context.request.json()) as {
      imageBase64?: string;
      mimeType?: string;
      style_name?: string;
      custom_prompt?: string;
      model?: string;
    };

    if (!body.imageBase64 || !body.mimeType || !body.style_name) {
      return json({ error: "Missing required fields: imageBase64, mimeType, style_name" }, 400);
    }

    const imageBytes = base64ToUint8Array(body.imageBase64);
    const prompt = buildPrompt(body.style_name, body.custom_prompt);
    const model = body.model ?? aiConfig.transformationModel;

    const { buffer } = await generateFull(imageBytes, prompt, body.mimeType, [], model);
    return json({ result_base64: uint8ArrayToBase64(buffer) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Transform failed" }, 500);
  }
};
