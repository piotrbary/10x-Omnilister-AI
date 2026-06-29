import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { PhotoRecord } from "@/types/objects";

function toPhotoRecord(row: {
  id: string;
  object_id: string;
  original_url: string;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
}): PhotoRecord {
  return {
    id: row.id,
    objectId: row.object_id,
    originalUrl: row.original_url,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

const ConfirmUploadSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
});

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { objectId } = context.params;
  if (!objectId) {
    return new Response(JSON.stringify({ error: "Missing objectId" }), { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("photos")
    .select("id, object_id, original_url, file_size_bytes, mime_type, created_at")
    .eq("object_id", objectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ photos: data.map(toPhotoRecord) }), { status: 200 });
};

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

  const parsed = ConfirmUploadSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }), {
      status: 422,
    });
  }

  const { path, mimeType, fileSize } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify object ownership
  const { error: objectError } = await supabase
    .from("objects")
    .select("id")
    .eq("id", objectId)
    .eq("user_id", user.id)
    .single();

  if (objectError) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  // Validate the client-supplied storage path before trusting it in getPublicUrl /
  // DB insert: it must live under this user's + object's prefix. Without this, a
  // caller can register another user's storage URL (cross-user hijack via the
  // public original-photos bucket). See lessons.md "Validate client-provided
  // storage paths before use".
  if (!path.startsWith(`${user.id}/${objectId}/`)) {
    return new Response(JSON.stringify({ error: "Invalid storage path" }), { status: 422 });
  }

  const { data: urlData } = supabase.storage.from("original-photos").getPublicUrl(path);
  const originalUrl = urlData.publicUrl;

  const { data: photoData, error: insertError } = await supabase
    .from("photos")
    .insert({
      user_id: user.id,
      object_id: objectId,
      original_url: originalUrl,
      thumbnail_url: null,
      file_size_bytes: fileSize,
      mime_type: mimeType,
    })
    .select("id, object_id, original_url, file_size_bytes, mime_type, created_at")
    .single();

  if (insertError) {
    // 23514 = check_violation — quota constraint on profiles.storage_used_bytes
    if (insertError.code === "23514") {
      return new Response(JSON.stringify({ error: "Storage quota exceeded" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ photo: toPhotoRecord(photoData) }), { status: 201 });
};
