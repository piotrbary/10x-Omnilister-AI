import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { FeedbackRequestSchema } from "@/types/transformations";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { jobId } = context.params;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = FeedbackRequestSchema.safeParse(body);
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

  // Verify ownership before update — mirror all WHERE filters on the UPDATE
  const { data: job, error: jobErr } = await supabase
    .from("transformations")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("transformations")
    .update({ feedback: parsed.data.feedback, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", user.id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
