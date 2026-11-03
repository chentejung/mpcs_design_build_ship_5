"use client";
// The browser's door to Supabase, for Realtime on the Watchlist and /status only (AGENTS.md → Data access).
// It only ever reads, through RLS: the publishable key plus the signed-in user's Clerk session token, so a
// Watchlist receives changes only for Markets its user may see. Signed out it runs as `anon`.
import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import type { Database } from "./database.types";

declare global {
  interface Window {
    Clerk?: { session?: { getToken(options?: { skipCache?: boolean }): Promise<string | null> } | null };
  }
}

/**
 * Realtime re-reads the token only on its 25 s heartbeat, and a cached Clerk token (≈60 s life) can already be
 * near expiry then; the server closes the channel when it expires ("Token has expired"). So, while signed in,
 * hand Realtime a freshly minted token every 30 s.
 */
const TOKEN_REFRESH_MS = 30_000;

// One client per tab, so Realtime shares one socket. The token is read from the current Clerk session at each
// call, and Clerk refreshes it before it expires (session tokens last about a minute).
let client: SupabaseClient<Database> | null = null;

function browserClient(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => (await window.Clerk?.session?.getToken()) ?? null },
  );
  return client;
}

/**
 * The browser client, once Clerk knows whether someone is signed in (null until then). When the session
 * changes in this tab, Realtime is handed the new identity.
 */
export function useSupabaseBrowser(): SupabaseClient<Database> | null {
  const { isLoaded, session } = useSession();
  const db = isLoaded ? browserClient() : null;
  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (!db) return;
    void db.realtime.setAuth();
    if (!sessionId) return;
    const id = setInterval(async () => {
      const token = await window.Clerk?.session?.getToken({ skipCache: true }).catch(() => null);
      if (token) void db.realtime.setAuth(token);
    }, TOKEN_REFRESH_MS);
    return () => clearInterval(id);
  }, [db, sessionId]);
  return db;
}
