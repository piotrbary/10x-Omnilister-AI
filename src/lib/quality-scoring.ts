import { OPENROUTER_API_KEY } from "astro:env/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";
import type { QualityScoreSnapshot } from "../types/transformations";
import type { GptScoringResponse, ObjectAnalysisResult, PhotoScoreResult } from "../types/analysis";
import type { ObjectCategory } from "./config";
import { aiConfig, scoringConfig } from "./config";

const SCORE_DIMENSIONS = [
  "sharpness",
  "lighting",
  "background",
  "object_features",
  "damage_defects",
  "labels",
  "angle_coverage",
  "sales_readiness",
] as const;

const GPT_JSON_SCHEMA = {
  name: "photo_quality_score",
  strict: true,
  schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["car", "real-estate", "item"] },
      features_text: { type: "string" },
      scores: {
        type: "object",
        properties: {
          sharpness:       { type: "number" },
          lighting:        { type: "number" },
          background:      { type: "number" },
          object_features: { type: "number" },
          damage_defects:  { type: "number" },
          labels:          { type: "number" },
          angle_coverage:  { type: "number" },
          sales_readiness: { type: "number" },
        },
        required: SCORE_DIMENSIONS as unknown as string[],
        additionalProperties: false,
      },
    },
    required: ["category", "features_text", "scores"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are a professional product photography quality assessor. \
Evaluate the photo on 8 quality dimensions, scoring each 0–10:

- sharpness: 0=completely blurry, 5=acceptable consumer snapshot, 10=tack-sharp studio quality
- lighting: 0=harsh shadows/too dark, 5=adequate natural light, 10=even professional studio lighting
- background: 0=cluttered/distracting, 5=neutral but imperfect, 10=clean seamless studio background
- object_features: 0=key features hidden, 5=main features visible, 10=all features clearly presented
- damage_defects: 0=severe damage obscuring product, 5=minor imperfections, 10=pristine no visible defects
- labels: 0=labels absent/unreadable, 5=partially visible, 10=all labels/branding clearly legible
- angle_coverage: 0=extreme angle hiding product, 5=front-only shot, 10=optimal 3/4 angle showing max surface
- sales_readiness: 0=unusable for sales listing, 5=acceptable for informal sale, 10=ready for premium catalog

IMPORTANT: Scores reflect PHOTO PRESENTATION QUALITY only — not the product's commercial value or condition.
Also detect the object category ('car', 'real-estate', or 'item') and describe visible features in 2–3 factual sentences.`;

function computeOverall(
  scores: GptScoringResponse["scores"],
  category: ObjectCategory,
): number {
  const weights = scoringConfig.categoryWeights[category];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of SCORE_DIMENSIONS) {
    weightedSum += scores[dim] * weights[dim];
    totalWeight += weights[dim];
  }
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

interface GptCallResult {
  snapshot: QualityScoreSnapshot;
  gptCategory: ObjectCategory;
  featuresText: string;
}

async function _callGptVision(
  signedUrl: string,
  category: ObjectCategory,
  logs: string[],
  model: string = aiConfig.visionModel,
): Promise<GptCallResult> {
  let lastError: unknown;
  const keyPreview = (OPENROUTER_API_KEY ?? "").slice(0, 8) || "(missing)";

  for (let attempt = 0; attempt <= aiConfig.maxRetries; attempt++) {
    try {
      logs.push(`[vision #${attempt + 1}] POST ${aiConfig.baseUrl}/chat/completions model=${model} key=${keyPreview}... url_len=${signedUrl.length}`);

      const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: signedUrl, detail: "high" } },
                { type: "text", text: "Score this photo and return structured JSON." },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: GPT_JSON_SCHEMA },
          max_tokens: aiConfig.maxOutputTokens,
        }),
      });

      logs.push(`[vision #${attempt + 1}] response status=${response.status} ok=${response.ok}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        logs.push(`[vision #${attempt + 1}] ERROR body=${errorText.slice(0, 500)}`);
        throw new Error(
          `OpenRouter vision ${response.status}: ${errorText.slice(0, 400) || response.statusText || "(no body)"}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content;
      logs.push(`[vision #${attempt + 1}] content_len=${content?.length ?? 0} preview=${(content ?? "").slice(0, 120)}`);

      if (!content) throw new Error("Empty content from GPT-4o response");

      let gpt: GptScoringResponse;
      try {
        gpt = JSON.parse(content) as GptScoringResponse;
      } catch {
        throw new Error(`Malformed JSON from GPT-4o: ${content.slice(0, 120)}`);
      }

      if (!gpt.scores || typeof gpt.scores.sharpness !== "number") {
        throw new Error("Invalid GPT-4o response structure: missing scores");
      }

      const overall = computeOverall(gpt.scores, category);
      const snapshot: QualityScoreSnapshot = {
        sharpness:       gpt.scores.sharpness,
        lighting:        gpt.scores.lighting,
        background:      gpt.scores.background,
        object_features: gpt.scores.object_features,
        damage_defects:  gpt.scores.damage_defects,
        labels:          gpt.scores.labels,
        angle_coverage:  gpt.scores.angle_coverage,
        sales_readiness: gpt.scores.sales_readiness,
        overall,
        is_sales_ready: overall >= scoringConfig.salesReadinessThreshold,
      };

      const gptCategory = (
        scoringConfig.categories.includes(gpt.category as ObjectCategory)
          ? gpt.category
          : category
      ) as ObjectCategory;

      logs.push(`[vision #${attempt + 1}] SUCCESS overall=${overall} category=${gptCategory}`);
      return { snapshot, gptCategory, featuresText: gpt.features_text ?? "" };
    } catch (err) {
      lastError = err;
      logs.push(`[vision #${attempt + 1}] CAUGHT ${String(err).slice(0, 300)}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function scorePhoto(
  signedUrl: string,
  category: ObjectCategory,
  model: string = aiConfig.visionModel,
): Promise<QualityScoreSnapshot> {
  const { snapshot } = await _callGptVision(signedUrl, category, [], model);
  return snapshot;
}

export async function analyzeObject(
  objectId: string,
  photoIds: string[],
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ObjectAnalysisResult> {
  const debugLogs: string[] = [];

  const { data: photos, error: photosErr } = await supabase
    .from("photos")
    .select("id, original_url")
    .eq("object_id", objectId)
    .eq("user_id", userId)
    .in("id", photoIds);

  if (photosErr || !photos) {
    throw new Error(`Failed to fetch photos: ${photosErr?.message ?? "no data"}`);
  }

  const { data: objectRow } = await supabase
    .from("objects")
    .select("category")
    .eq("id", objectId)
    .eq("user_id", userId)
    .single();

  const knownCategory = (objectRow?.category as ObjectCategory | null) ?? "item";
  debugLogs.push(`[setup] photos=${photos.length} category=${knownCategory} objectId=${objectId}`);

  // Generate signed URLs (original-photos bucket is private)
  const signedUrlMap = new Map<string, string>();
  for (const photo of photos) {
    const { data: signed, error: signedErr } = await supabase.storage
      .from("original-photos")
      .createSignedUrl(photo.original_url, 60);
    const gotSigned = !!signed?.signedUrl;
    debugLogs.push(`[signedUrl photo=${photo.id.slice(0, 8)}] ok=${gotSigned} err=${signedErr?.message ?? "none"} original_url_len=${photo.original_url.length}`);
    signedUrlMap.set(photo.id, signed?.signedUrl ?? photo.original_url);
  }

  // Score all photos in parallel
  const settled = await Promise.allSettled(
    photos.map(async (photo) => {
      const url = signedUrlMap.get(photo.id) ?? photo.original_url;
      debugLogs.push(`[photo ${photo.id.slice(0, 8)}] calling GPT vision url_len=${url.length}`);
      const result = await _callGptVision(url, knownCategory, debugLogs);
      return { result };
    }),
  );

  const photoScores: PhotoScoreResult[] = [];
  let firstCategory: ObjectCategory | null = null;
  let firstFeaturesText: string | null = null;

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const photo = photos[i];

    if (outcome.status === "rejected") {
      photoScores.push({ photo_id: photo.id, error: String(outcome.reason) });
      continue;
    }

    const { result } = outcome.value;
    const { snapshot, gptCategory, featuresText } = result;

    // Insert quality_scores row
    const { data: scoreRow, error: insertErr } = await supabase
      .from("quality_scores")
      .insert({
        user_id: userId,
        photo_id: photo.id,
        category: gptCategory,
        sharpness: snapshot.sharpness,
        lighting: snapshot.lighting,
        background: snapshot.background,
        object_features: snapshot.object_features,
        damage_defects: snapshot.damage_defects,
        labels: snapshot.labels,
        angle_coverage: snapshot.angle_coverage,
        sales_readiness: snapshot.sales_readiness,
        overall_score: snapshot.overall,
        is_sales_ready: snapshot.is_sales_ready,
      })
      .select("id")
      .single();

    if (insertErr || !scoreRow) {
      photoScores.push({ photo_id: photo.id, error: insertErr?.message ?? "DB insert failed" });
      continue;
    }

    photoScores.push({ photo_id: photo.id, snapshot, score_id: scoreRow.id });

    if (firstCategory === null) {
      firstCategory = gptCategory;
      firstFeaturesText = featuresText;
    }
  }

  // Update object's category and features_text from the first successful result
  if (firstCategory !== null) {
    const updatePayload: { category: ObjectCategory; features_text?: string } = {
      category: firstCategory,
    };
    if (firstFeaturesText) updatePayload.features_text = firstFeaturesText;

    if (objectRow?.category === null) {
      await supabase
        .from("objects")
        .update(updatePayload)
        .eq("id", objectId)
        .eq("user_id", userId);
    } else if (firstFeaturesText) {
      await supabase
        .from("objects")
        .update({ features_text: firstFeaturesText })
        .eq("id", objectId)
        .eq("user_id", userId);
    }
  }

  return {
    category: firstCategory ?? knownCategory,
    features_text: firstFeaturesText ?? "",
    photoScores,
    debugLogs,
  };
}
