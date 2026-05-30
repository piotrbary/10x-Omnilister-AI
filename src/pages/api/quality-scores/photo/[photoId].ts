import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { QualityScoreSnapshot } from "@/types/transformations";

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
    sharpness:       data.sharpness,
    lighting:        data.lighting,
    background:      data.background,
    object_features: data.object_features,
    damage_defects:  data.damage_defects,
    labels:          data.labels,
    angle_coverage:  data.angle_coverage,
    sales_readiness: data.sales_readiness,
    overall:         data.overall_score,
    is_sales_ready:  data.is_sales_ready,
  };

  return new Response(JSON.stringify({ score }), { status: 200 });
};
