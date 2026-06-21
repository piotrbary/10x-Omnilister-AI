import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { QualityScoreSnapshot } from "@/types/transformations";

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const idsParam = new URL(context.request.url).searchParams.get("ids") ?? "";
  if (!idsParam.trim()) {
    return new Response(JSON.stringify({ error: "ids query param is required" }), { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0 || ids.length > 20) {
    return new Response(JSON.stringify({ error: "ids must be 1–20 comma-separated UUIDs" }), {
      status: 400,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // RLS guarantees user_id filter; we add it explicitly per lessons.md
  const { data, error } = await supabase
    .from("transformations")
    .select(
      "id, photo_id, status, result_url, score_before, score_after, error_message, retry_count",
    )
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Return in the same order as requested ids
  const rowById = new Map((data ?? []).map((row) => [row.id, row]));
  const jobs = ids
    .filter((id) => rowById.has(id))
    .map((id) => {
      const row = rowById.get(id)!;
      return {
        id: row.id,
        photo_id: row.photo_id,
        status: row.status,
        result_url: row.result_url,
        score_before: row.score_before as unknown as QualityScoreSnapshot | null,
        score_after: row.score_after as unknown as QualityScoreSnapshot | null,
        error_message: row.error_message,
        retry_count: row.retry_count,
      };
    });

  return new Response(JSON.stringify({ jobs }), { status: 200 });
};
