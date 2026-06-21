import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { analyzeObject } from "@/lib/quality-scoring";
import type { PhotoScoreResult } from "@/types/analysis";

const AnalyzeBodySchema = z.object({
  photo_ids: z.array(z.string().uuid()).min(1),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { objectId } = context.params;
  if (!objectId) {
    return new Response(JSON.stringify({ error: "Missing objectId" }), { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = AnalyzeBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }),
      { status: 400 },
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify object ownership
  const { error: objectErr } = await supabase
    .from("objects")
    .select("id")
    .eq("id", objectId)
    .eq("user_id", user.id)
    .single();

  if (objectErr) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  // Verify all photo_ids belong to this object and user
  const { data: ownedPhotos, error: photosErr } = await supabase
    .from("photos")
    .select("id")
    .eq("object_id", objectId)
    .eq("user_id", user.id)
    .in("id", parsed.data.photo_ids);

  if (photosErr) {
    return new Response(JSON.stringify({ error: photosErr.message }), { status: 500 });
  }

  const ownedIds = new Set((ownedPhotos ?? []).map((p) => p.id));
  const unauthorized = parsed.data.photo_ids.filter((id) => !ownedIds.has(id));
  if (unauthorized.length > 0) {
    return new Response(
      JSON.stringify({ error: `Photo(s) not found: ${unauthorized.join(", ")}` }),
      { status: 400 },
    );
  }

  let result;
  try {
    result = await analyzeObject(objectId, parsed.data.photo_ids, supabase, user.id);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Analysis failed" }),
      { status: 500 },
    );
  }

  // Return 500 only if ALL photos failed
  const allFailed = result.photoScores.every((s: PhotoScoreResult) => "error" in s);
  if (allFailed) {
    return new Response(JSON.stringify({ error: "All photos failed analysis", scores: result.photoScores, debug: result.debugLogs }), {
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({
      category: result.category,
      features_text: result.features_text,
      scores: result.photoScores,
      debug: result.debugLogs,
    }),
    { status: 200 },
  );
};
