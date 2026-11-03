// The server's door to Supabase (AGENTS.md → Data access). Every call carries the signed-in user's Clerk session
// token, so row-level security decides what they can read and write; signed out there is no token and the call
// runs as `anon`, which can read markets and worker_runs only. Only the publishable key is here: there is no
// service-role or secret key in the app, and no way around RLS.
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function supabase() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => (await auth()).getToken(),
  });
}
