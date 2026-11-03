"use server";
// Follow, unfollow and Clear finished (AGENTS.md → Product rules 4–5, Data access). App code never sets or
// filters user_id: the column default fills it from the Clerk token and RLS keeps each user to their own rows,
// so a filter on market_id here can only ever touch the caller's Follows.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

export type FollowResult = { ok: true } | { ok: false; message: string };

const MARKET_ID = /^[\w-]{1,64}$/;

async function signedIn(): Promise<boolean> {
  return (await auth()).userId !== null;
}

function done(): FollowResult {
  revalidatePath("/");
  revalidatePath("/browse");
  return { ok: true };
}

export async function follow(marketId: string): Promise<FollowResult> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to follow Markets." };
  if (typeof marketId !== "string" || !MARKET_ID.test(marketId)) return { ok: false, message: "That isn't a Market." };

  const { error } = await supabase().from("follows").insert({ market_id: marketId });
  if (!error) return done();
  if (error.code === "23505") return done(); // already following: nothing to do
  if (error.message.includes("Watchlist full")) {
    return { ok: false, message: "Watchlist full (25). Unfollow a Market to follow another." };
  }
  if (error.code === "23503") return { ok: false, message: "That Market isn't tracked any more." };
  console.error("follow failed", error);
  return { ok: false, message: "Couldn't follow that Market. Try again." };
}

export async function unfollow(marketId: string): Promise<FollowResult> {
  if (!(await signedIn())) return { ok: false, message: "Sign in first." };
  if (typeof marketId !== "string" || !MARKET_ID.test(marketId)) return { ok: false, message: "That isn't a Market." };

  const { error } = await supabase().from("follows").delete().eq("market_id", marketId);
  if (!error) return done();
  console.error("unfollow failed", error);
  return { ok: false, message: "Couldn't unfollow that Market. Try again." };
}

/** Deletes the caller's Follows of Finished Markets. */
export async function clearFinished(): Promise<FollowResult> {
  if (!(await signedIn())) return { ok: false, message: "Sign in first." };
  const db = supabase();
  const finished = await db.from("follows").select("market_id, markets!inner(closed)").eq("markets.closed", true);
  if (finished.error) {
    console.error("clear finished: load failed", finished.error);
    return { ok: false, message: "Couldn't clear Finished Markets. Try again." };
  }
  const ids = finished.data.map((f) => f.market_id);
  if (ids.length === 0) return done();
  const { error } = await db.from("follows").delete().in("market_id", ids);
  if (!error) return done();
  console.error("clear finished failed", error);
  return { ok: false, message: "Couldn't clear Finished Markets. Try again." };
}
