import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { objectId, photoId } = context.params;
  if (!objectId || !photoId) {
    return new Response(JSON.stringify({ error: "Missing objectId or photoId" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data: photo, error: fetchError } = await supabase
    .from("photos")
    .select("id, original_url")
    .eq("id", photoId)
    .eq("object_id", objectId)
    .eq("user_id", user.id)
    .single();

  if (fetchError) {
    return new Response(JSON.stringify({ error: "Photo not found" }), { status: 404 });
  }

  // Extract storage path from public URL (last 3 segments: userId/objectId/fileName)
  const urlObj = new URL(photo.original_url);
  const segments = urlObj.pathname.split("/").filter(Boolean);
  const storagePath = segments.slice(-3).join("/");

  // Delete DB row first — the trigger decrements profiles.storage_used_bytes
  const { error: deleteError } = await supabase.from("photos").delete().eq("id", photoId).eq("user_id", user.id);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  // Best-effort storage removal; orphaned file is acceptable if this fails
  await supabase.storage.from("original-photos").remove([storagePath]);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
