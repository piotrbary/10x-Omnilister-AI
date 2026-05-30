import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { ObjectRecord } from "@/types/objects";

const CreateObjectSchema = z.object({
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

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("objects")
    .select("id, name, version, category, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ objects: data.map(toObjectRecord) }), { status: 200 });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const parsed = CreateObjectSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Validation failed" }), {
      status: 422,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("objects")
    .insert({ user_id: user.id, name: parsed.data.name, version: 1 })
    .select("id, name, version, category, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ object: toObjectRecord(data) }), { status: 201 });
};
