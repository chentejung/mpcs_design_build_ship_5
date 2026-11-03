"use server";
// Records that the signed-in user opened their Watchlist (CONTEXT.md → Recap). The page reads the previous visit on
// the server first; the browser calls this once the Watchlist is on screen, so the next Recap starts from now.
// App code never sets user_id: the insert leaves it to the column default (the Clerk token's sub), and on a second
// visit the conflict on that primary key turns it into an update of last_seen_at. RLS keeps both to the caller's row.
// No revalidatePath: nothing on screen changes, and the Recap stays as computed for this page load.
import { auth } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";

export async function recordVisit(): Promise<void> {
  if ((await auth()).userId === null) return;
  const { error } = await supabase()
    .from("visits")
    .upsert({ last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("record visit failed", error);
}
