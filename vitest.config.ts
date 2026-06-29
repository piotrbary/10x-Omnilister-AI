/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { getViteConfig, envField } from "astro/config";

// getViteConfig is the bridge that resolves the `astro:env/server` virtual module.
// We pass `configFile: false` so it does NOT load astro.config.mjs — that config's
// Cloudflare adapter injects a Vite plugin that rejects the test environment. The
// `astro:env` schema is mirrored inline instead (keep in sync with astro.config.mjs).
// `.env.test` is loaded by Vite's env mechanism (mode defaults to "test" under vitest).

// Shared so vitest.config.unit.ts (used by Stryker) reuses everything but the include set.
export const astroInline = {
  configFile: false as const,
  output: "server" as const,
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
};

// setupFiles defaults to [] so vitest.config.unit.ts (Stryker) stays lean — only
// the default (integration-inclusive) config wires the shared test setup module.
export const makeTestConfig = (include: string[], setupFiles: string[] = []) =>
  getViteConfig(
    {
      resolve: {
        alias: {
          "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
      },
      test: {
        include,
        exclude: [".stryker-tmp/**", "agent-sdk-examples/**", "packages/**", "node_modules/**"],
        setupFiles,
      },
    },
    astroInline,
  );

export default makeTestConfig(
  ["src/**/*.{test,spec}.{ts,tsx}", "tests/integration/**/*.{test,spec}.ts"],
  ["./tests/integration/setup.ts"],
);
