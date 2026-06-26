import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
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

  const { data: job } = await supabase
    .from("transformations")
    .select("id, result_storage_path")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
  }

  const storagePath = job.result_storage_path as string | null;

  if (!storagePath) {
    return new Response(JSON.stringify({ error: "No storage path recorded" }), { status: 404 });
  }

  const { data: signed } = await supabase.storage.from("transformed-photos").createSignedUrl(storagePath, 3600);

  if (!signed?.signedUrl) {
    return new Response(JSON.stringify({ error: "Failed to generate signed URL" }), { status: 502 });
  }

  return new Response(JSON.stringify({ url: signed.signedUrl }), {
    status: 200,
    headers: { "Cache-Control": "max-age=3300" },
  });
};
