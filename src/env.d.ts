declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    runtime: {
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      };
    };
  }
}
