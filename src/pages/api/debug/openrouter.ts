import type { APIRoute } from "astro";
import { OPENROUTER_API_KEY } from "astro:env/server";
import { aiConfig } from "@/lib/config";

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const key = OPENROUTER_API_KEY ?? "";
  const keyInfo = key
    ? `set — starts with "${key.slice(0, 14)}…" (${key.length} chars)`
    : "NOT SET — check .dev.vars in project root";

  let authStatus = "not tested";
  let authBody: unknown = null;
  let chatStatus = "not tested";
  let chatBody: unknown = null;

  if (key) {
    // 1. Check key validity
    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
      });
      authStatus = `HTTP ${res.status}`;
      authBody = await res.json().catch(() => null);
    } catch (err) {
      authStatus = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // 2. Minimal chat completion to verify vision model access
    try {
      const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: aiConfig.visionModel,
          messages: [{ role: "user", content: "Reply with the word OK only." }],
          max_tokens: 5,
        }),
      });
      chatStatus = `HTTP ${res.status}`;
      const raw = await res.text().catch(() => "");
      try {
        chatBody = JSON.parse(raw);
      } catch {
        chatBody = raw.slice(0, 300);
      }
    } catch (err) {
      chatStatus = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return new Response(
    JSON.stringify(
      {
        OPENROUTER_API_KEY: keyInfo,
        visionModel: aiConfig.visionModel,
        transformationModel: aiConfig.transformationModel,
        baseUrl: aiConfig.baseUrl,
        authCheck: { status: authStatus, body: authBody },
        chatCheck: { status: chatStatus, body: chatBody },
      },
      null,
      2,
    ),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
