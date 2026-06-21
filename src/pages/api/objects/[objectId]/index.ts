import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { ObjectRecord, PhotoRecord } from "@/types/objects";

const PatchObjectSchema = z.object({
  name: z.string().min(1).max(100),
});

function toObjectRecord(row: {
  id: string;
  name: string;
  version: number;
  category: string | null;
  created_at: string;
}): ObjectRecord {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    category: row.category,
    createdAt: row.created_at,
  };
}

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

  const { data: objectData, error: objectError } = await supabase
    .from("objects")
    .select("id, name, version, category, created_at")
    .eq("id", objectId)
    .eq("user_id", user.id)
    .single();

  if (objectError) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  const { data: photosData, error: photosError } = await supabase
    .from("photos")
    .select("id, object_id, original_url, file_size_bytes, mime_type, created_at")
    .eq("object_id", objectId)
    .order("created_at", { ascending: true });

  if (photosError) {
    return new Response(JSON.stringify({ error: photosError.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      object: toObjectRecord(objectData),
      photos: photosData.map(toPhotoRecord),
    }),
    { status: 200 },
  );
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = PatchObjectSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }),
      { status: 422 },
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("objects")
    .update({ name: parsed.data.name })
    .eq("id", objectId)
    .eq("user_id", user.id)
    .select("id, name, version, category, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  return new Response(JSON.stringify({ object: toObjectRecord(data) }), { status: 200 });
};
