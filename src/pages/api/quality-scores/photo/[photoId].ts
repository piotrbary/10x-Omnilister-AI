import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { QualityScoreSnapshot } from "@/types/transformations";
import { scorePhoto } from "@/lib/quality-scoring";
import { aiConfig } from "@/lib/config";
import type { ObjectCategory } from "@/lib/config";

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { photoId } = context.params;
  if (!photoId) {
    return new Response(JSON.stringify({ error: "Missing photoId" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify user owns the photo
  const { error: photoErr } = await supabase
    .from("photos")
    .select("id")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (photoErr) {
    return new Response(JSON.stringify({ error: "Photo not found" }), { status: 404 });
  }

  const { data, error } = await supabase
    .from("quality_scores")
    .select(
      "sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score, is_sales_ready",
    )
    .eq("photo_id", photoId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "No score found for this photo" }), { status: 404 });
  }

  const score: QualityScoreSnapshot = {
    sharpness: data.sharpness,
    lighting: data.lighting,
    background: data.background,
    object_features: data.object_features,
    damage_defects: data.damage_defects,
    labels: data.labels,
    angle_coverage: data.angle_coverage,
    sales_readiness: data.sales_readiness,
    overall: data.overall_score,
    is_sales_ready: data.is_sales_ready,
  };

  return new Response(JSON.stringify({ score }), { status: 200 });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { photoId } = context.params;
  if (!photoId) {
    return new Response(JSON.stringify({ error: "Missing photoId" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify ownership and get photo URL + object_id
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, original_url, object_id")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .single();

  if (photoErr || !photo) {
    return new Response(JSON.stringify({ error: "Photo not found" }), { status: 404 });
  }

  // Cache check — original photo is immutable; any existing score is valid
  const { data: cached } = await supabase
    .from("quality_scores")
    .select(
      "sharpness, lighting, background, object_features, damage_defects, labels, angle_coverage, sales_readiness, overall_score, is_sales_ready",
    )
    .eq("photo_id", photoId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    const score: QualityScoreSnapshot = {
      sharpness: cached.sharpness,
      lighting: cached.lighting,
      background: cached.background,
      object_features: cached.object_features,
      damage_defects: cached.damage_defects,
      labels: cached.labels,
      angle_coverage: cached.angle_coverage,
      sales_readiness: cached.sales_readiness,
      overall: cached.overall_score,
      is_sales_ready: cached.is_sales_ready,
    };
    return new Response(JSON.stringify({ score }), { status: 200 });
  }

  // Get object category for weighted scoring
  const { data: obj } = await supabase
    .from("objects")
    .select("category")
    .eq("id", photo.object_id)
    .eq("user_id", user.id)
    .single();

  const category = (obj?.category as ObjectCategory | null) ?? "item";

  // Call cheap vision model — original_url is a public URL, usable directly
  let snapshot: QualityScoreSnapshot;
  try {
    snapshot = await scorePhoto(photo.original_url, category, aiConfig.previewModel);
  } catch {
    return new Response(JSON.stringify({ error: "Scoring failed" }), { status: 502 });
  }

  // Persist to quality_scores for future cache hits
  await supabase.from("quality_scores").insert({
    user_id: user.id,
    photo_id: photoId,
    category,
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
  });

  return new Response(JSON.stringify({ score: snapshot }), { status: 200 });
};
