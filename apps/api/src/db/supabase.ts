import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, type Env } from "../config/env.js";

/**
 * Optional supabase-js client for admin / Storage features later.
 *
 * NOT used for core persistence — the ORM talks to Postgres directly via `DATABASE_URL`
 * (drizzle-orm + postgres.js), and app authentication stays on cookie sessions.
 *
 * Key selection: prefers the service-role key (server-side only, bypasses RLS) when
 * `preferServiceRole` is set and configured; otherwise uses the anon/publishable key.
 * Never ship the service-role key to the browser.
 */
export function hasSupabaseConfig(config: Env = env): boolean {
  return Boolean(
    config.SUPABASE_URL.trim() &&
      (config.SUPABASE_ANON_KEY.trim() ||
        config.SUPABASE_PUBLISHABLE_KEY.trim() ||
        config.SUPABASE_SERVICE_ROLE_KEY.trim()),
  );
}

export function createSupabaseClient(
  options: { config?: Env; preferServiceRole?: boolean } = {},
): SupabaseClient {
  const config = options.config ?? env;
  const url = config.SUPABASE_URL.trim();
  if (!url) {
    throw new Error(
      "SUPABASE_URL is not set (Supabase Dashboard → Project Settings → API).",
    );
  }

  const serviceRole = config.SUPABASE_SERVICE_ROLE_KEY.trim();
  const publicKey =
    config.SUPABASE_PUBLISHABLE_KEY.trim() || config.SUPABASE_ANON_KEY.trim();
  const key = options.preferServiceRole && serviceRole ? serviceRole : publicKey;

  if (!key) {
    throw new Error(
      "No Supabase key configured. Set SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).",
    );
  }

  return createClient(url, key, {
    // Server process: app auth is cookie-session based; Supabase Auth is not used.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
