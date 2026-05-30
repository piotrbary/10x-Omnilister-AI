import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { styleId } = context.params;
  if (!styleId) {
    return new Response(JSON.stringify({ error: "styleId is required" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify the style exists and is visible to the user (RLS SELECT enforces visibility)
  const { data: style, error: selectError } = await supabase
    .from("styles")
    .select("id, is_reported")
    .eq("id", styleId)
    .maybeSingle();

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 });
  }

  if (!style) {
    return new Response(JSON.stringify({ error: "Style not found" }), { status: 404 });
  }

  // Already reported — idempotent no-op
  if (style.is_reported) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const { error: updateError } = await supabase
    .from("styles")
    .update({ is_reported: true, reporter_user_id: user.id })
    .eq("id", styleId)
    .eq("is_reported", false);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
