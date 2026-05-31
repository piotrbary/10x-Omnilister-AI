import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { buildPrompt } from "@/lib/transformation-styles";
import { processTransformationBatch } from "@/lib/transformation-processor";
import { StartTransformationRequestSchema } from "@/types/transformations";
import type { QualityScoreSnapshot, TransformationJob } from "@/types/transformations";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = StartTransformationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }),
      { status: 400 },
    );
  }

  const { object_id, photo_ids, style_name, custom_prompt } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify object ownership
  const { data: objectRow, error: objectErr } = await supabase
    .from("objects")
    .select("id, category")
    .eq("id", object_id)
    .eq("user_id", user.id)
    .single();

  if (objectErr || !objectRow) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  // Verify all photo_ids belong to this object and user
  const { data: ownedPhotos, error: photosErr } = await supabase
    .from("photos")
    .select("id")
    .eq("object_id", object_id)
    .eq("user_id", user.id)
    .in("id", photo_ids);

  if (photosErr) {
    return new Response(JSON.stringify({ error: photosErr.message }), { status: 500 });
  }

  const ownedIds = new Set((ownedPhotos ?? []).map((p) => p.id));
  const unauthorized = photo_ids.filter((id) => !ownedIds.has(id));
  if (unauthorized.length > 0) {
    return new Response(
      JSON.stringify({ error: `Photo(s) not found: ${unauthorized.join(", ")}` }),
      { status: 400 },
    );
  }

  // Fetch latest quality_scores for each photo (score_before)
  const { data: scores } = await supabase
    .from("quality_scores")
    .select(
      "photo_id, sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score, is_sales_ready, created_at",
    )
    .in("photo_id", photo_ids)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Deduplicate — keep latest per photo
  const latestScoreByPhotoId = new Map<string, QualityScoreSnapshot>();
  for (const row of scores ?? []) {
    if (!latestScoreByPhotoId.has(row.photo_id)) {
      latestScoreByPhotoId.set(row.photo_id, {
        sharpness: row.sharpness,
        lighting: row.lighting,
        background: row.background,
        object_features: row.object_features,
        damage_defects: row.damage_defects,
        labels: row.labels,
        angle_coverage: row.angle_coverage,
        sales_readiness: row.sales_readiness,
        overall: row.overall_score,
        is_sales_ready: row.is_sales_ready,
      });
    }
  }

  const prompt = buildPrompt(style_name, custom_prompt);

  // Insert one transformations row per photo
  const inserts = photo_ids.map((photo_id) => ({
    user_id: user.id,
    object_id,
    photo_id,
    style_name,
    prompt,
    status: "pending" as const,
    score_before: (latestScoreByPhotoId.get(photo_id) ?? null) as unknown as import("@/types/database.generated").Json,
  }));

  const { data: insertedJobs, error: insertErr } = await supabase
    .from("transformations")
    .insert(inserts)
    .select(
      "id, user_id, object_id, photo_id, style_name, prompt, status, draft_url, result_url, result_file_size_bytes, score_before, score_after, feedback, error_message, retry_count, created_at, updated_at",
    );

  if (insertErr || !insertedJobs) {
    return new Response(JSON.stringify({ error: insertErr?.message ?? "Insert failed" }), {
      status: 500,
    });
  }

  const jobs: TransformationJob[] = insertedJobs.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    object_id: row.object_id,
    photo_id: row.photo_id,
    style_name: row.style_name,
    prompt: row.prompt,
    status: row.status as TransformationJob["status"],
    draft_url: row.draft_url,
    result_url: row.result_url,
    result_file_size_bytes: row.result_file_size_bytes,
    score_before: (row.score_before as unknown as QualityScoreSnapshot | null),
    score_after: (row.score_after as unknown as QualityScoreSnapshot | null),
    feedback: row.feedback as TransformationJob["feedback"],
    error_message: row.error_message,
    retry_count: row.retry_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  // Fire background processing — must not await
  context.locals.runtime.ctx.waitUntil(processTransformationBatch(jobs, supabase));

  return new Response(
    JSON.stringify({ job_ids: jobs.map((j) => j.id) }),
    { status: 200 },
  );
};
