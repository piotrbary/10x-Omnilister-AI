import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

const VALID_CATEGORIES = ["car", "real-estate", "item"] as const;

const CreateStyleSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(VALID_CATEGORIES),
  prompt: z.string().min(10).max(2000),
  description: z.string().max(300).optional(),
  is_public: z.boolean().optional().default(false),
});

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const url = new URL(context.request.url);
  const category = url.searchParams.get("category");
  const publicOnly = url.searchParams.get("public_only") === "true";

  if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return new Response(JSON.stringify({ error: "category is required and must be one of: car, real-estate, item" }), {
      status: 400,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  let query = supabase
    .from("styles")
    .select("id, name, category, prompt, description, is_public, usage_count, is_reported, user_id, created_at")
    .eq("category", category)
    .order("usage_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (publicOnly) {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const styles = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    prompt: row.prompt,
    description: row.description,
    is_public: row.is_public,
    usage_count: row.usage_count,
    is_reported: row.is_reported,
    is_mine: row.user_id === user.id,
    created_at: row.created_at,
  }));

  return new Response(JSON.stringify({ styles }), { status: 200 });
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

  const parsed = CreateStyleSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
  }

  const { name, category, prompt, description, is_public } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("styles")
    .insert({ name, category, prompt, description: description ?? null, is_public, user_id: user.id })
    .select("id, name, category, prompt, description, is_public, usage_count, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ style: data }), { status: 201 });
};
