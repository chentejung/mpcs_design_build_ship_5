// The server's door to Supabase (AGENTS.md → Data access). It uses only the publishable key, so row-level
// security decides what every call can read or write; there is no service-role or secret key in the app.
// Signed out, a call runs as `anon`, which can read markets and worker_runs only.
// When Clerk is added, every call will also carry the signed-in user's Clerk session token
// (`accessToken: async () => (await auth()).getToken()`), as in Assignment 4.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function supabase() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
