"use client";
// The browser's door to Supabase, for Realtime on the Watchlist and /status only (AGENTS.md → Data access).
// It only ever reads, through RLS: the publishable key, plus (once Clerk is added) the signed-in user's
// Clerk session token from session.getToken(), so the Watchlist receives only that user's Markets.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/** One client per tab, so Realtime shares one socket. */
export function supabaseBrowser(accessToken?: () => Promise<string | null>): SupabaseClient<Database> {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, ...(accessToken ? { accessToken } : {}) },
  );
  return client;
}
