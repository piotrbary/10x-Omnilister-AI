import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { storageConfig } from "@/lib/config";

const UploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
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

  const parsed = UploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }), {
      status: 422,
    });
  }

  const { fileName, mimeType, fileSize } = parsed.data;

  if (!storageConfig.allowedPhotoMimeTypes.includes(mimeType as (typeof storageConfig.allowedPhotoMimeTypes)[number])) {
    return new Response(
      JSON.stringify({ error: `MIME type not allowed. Allowed: ${storageConfig.allowedPhotoMimeTypes.join(", ")}` }),
      { status: 422 },
    );
  }

  if (fileSize > storageConfig.maxSinglePhotoBytes) {
    return new Response(JSON.stringify({ error: "File too large. Maximum size is 10 MB." }), { status: 422 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  // Verify object ownership before placing its ID in the storage path
  const { error: objectError } = await supabase
    .from("objects")
    .select("id")
    .eq("id", objectId)
    .eq("user_id", user.id)
    .single();

  if (objectError) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  // Soft quota guard (hard backstop is the CHECK constraint on profiles)
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("storage_used_bytes")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return new Response(JSON.stringify({ error: "Could not retrieve quota information" }), { status: 500 });
  }

  if (profileData.storage_used_bytes + fileSize > storageConfig.Max_Client_Repository) {
    return new Response(JSON.stringify({ error: "Storage quota exceeded" }), { status: 409 });
  }

  // Soft photo count guard (no DB-level backstop; race accepted for MVP)
  const { count, error: countError } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("object_id", objectId);

  if (countError) {
    return new Response(JSON.stringify({ error: countError.message }), { status: 500 });
  }

  if ((count ?? 0) >= storageConfig.maxPhotosPerObject) {
    return new Response(
      JSON.stringify({ error: `Photo limit reached. Maximum ${storageConfig.maxPhotosPerObject} photos per object.` }),
      { status: 409 },
    );
  }

  const safeName = `${crypto.randomUUID()}_${fileName}`;
  const path = `${user.id}/${objectId}/${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("original-photos")
    .createSignedUploadUrl(path);

  if (uploadError) {
    return new Response(JSON.stringify({ error: "Failed to create signed upload URL" }), { status: 500 });
  }

  return new Response(JSON.stringify({ signedUrl: uploadData.signedUrl, path }), { status: 200 });
};
