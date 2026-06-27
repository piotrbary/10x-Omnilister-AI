import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const isJson = (context.request.headers.get("content-type") ?? "").includes("application/json");

  let email: string, password: string;
  if (isJson) {
    const body = (await context.request.json()) as { email?: string; password?: string };
    email = body.email ?? "";
    password = body.password ?? "";
  } else {
    const form = await context.request.formData();
    email = (form.get("email") as string) ?? "";
    password = (form.get("password") as string) ?? "";
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    if (isJson) return jsonRes({ error: "Supabase is not configured" }, 503);
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (isJson) {
    if (error) return jsonRes({ error: error.message }, 400);
    return jsonRes({ ok: true });
  }

  if (error) return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  return context.redirect("/");
};
