import { OPENROUTER_API_KEY } from "astro:env/server";
import { aiConfig } from "./config";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function generateFull(
  imageBuffer: Uint8Array,
  prompt: string,
  mimeType: string,
  logs: string[] = [],
): Promise<{ url: string; buffer: Uint8Array }> {
  const dataUrl = `data:${mimeType};base64,${uint8ArrayToBase64(imageBuffer)}`;
  const keyPreview = (OPENROUTER_API_KEY ?? "").slice(0, 8) || "(missing)";
  logs.push(`[generate] POST ${aiConfig.baseUrl}/chat/completions model=${aiConfig.transformationModel} key=${keyPreview}...`);

  const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: aiConfig.transformationModel,
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

  logs.push(`[generate] response status=${res.status}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logs.push(`[generate] ERROR_BODY=${text.slice(0, 500)}`);
    throw new Error(`Gemini image generation failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  type ImageChoice = {
    message: {
      content?: string;
      images?: Array<{ image_url?: { url?: string } }>;
    };
  };
  const data = (await res.json()) as { choices: ImageChoice[] };
  const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  logs.push(`[generate] image_present=${!!imageDataUrl} preview="${imageDataUrl?.slice(0, 40)}…"`);

  if (!imageDataUrl) throw new Error("No image in Gemini response");

  const base64 = imageDataUrl.includes(",") ? imageDataUrl.split(",")[1] : imageDataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  logs.push(`[generate] SUCCESS decoded_bytes=${bytes.byteLength}`);

  return { url: "", buffer: bytes };
}
