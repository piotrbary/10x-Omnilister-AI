import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { storageConfig } from "@/lib/config";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { jobId } = context.params;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("transformations")
    .select("id, status, result_file_size_bytes, user_id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
  }

  if (job.status !== "full_ready") {
    return new Response(
      JSON.stringify({ error: `Job must be full_ready to save; current status: ${job.status}` }),
      { status: 400 },
    );
  }

  // Pre-check storage limit before saving
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("storage_used_bytes")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return new Response(JSON.stringify({ error: "Could not read storage usage" }), { status: 500 });
  }

  const resultSize = job.result_file_size_bytes ?? 0;
  if (profile.storage_used_bytes + resultSize > storageConfig.Max_Client_Repository) {
    return new Response(
      JSON.stringify({
        error: `Storage limit of ${storageConfig.Max_Client_Repository_Label} reached. Free up space before saving.`,
      }),
      { status: 400 },
    );
  }

  // Update status — F-01 trigger increments storage_used_bytes automatically
  const { error: updateErr } = await supabase
    .from("transformations")
    .update({ status: "saved", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", user.id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ saved: true }), { status: 200 });
};
