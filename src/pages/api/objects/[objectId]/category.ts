import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { scoringConfig } from "@/lib/config";

const CategoryPatchSchema = z.object({
  category: z.enum(scoringConfig.categories),
  features_text: z.string().optional(),
});

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

  const parsed = CategoryPatchSchema.safeParse(body);
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

  const updatePayload: { category: string; features_text?: string } = {
    category: parsed.data.category,
  };
  if (parsed.data.features_text !== undefined) {
    updatePayload.features_text = parsed.data.features_text;
  }

  const { data, error } = await supabase
    .from("objects")
    .update(updatePayload)
    .eq("id", objectId)
    .eq("user_id", user.id)
    .select("category, features_text")
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Object not found" }), { status: 404 });
  }

  return new Response(
    JSON.stringify({ category: data.category, features_text: data.features_text }),
    { status: 200 },
  );
};
