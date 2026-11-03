"use server";
// Create and delete Alerts (AGENTS.md → Data model, Data access). Like follows.ts, app code never sets or
// filters user_id: the column default fills it from the Clerk token, RLS keeps each user to their own rows,
// and the foreign key to follows means an Alert can only be set on a Market the caller Follows.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { ALERT_COLUMNS, parseChance, toAlert, type Alert, type Direction } from "@/lib/alerts";
import { supabase } from "@/lib/supabase";

export type CreateAlertResult = { ok: true; alert: Alert } | { ok: false; message: string };
export type DeleteAlertResult = { ok: true } | { ok: false; message: string };

const MARKET_ID = /^[\w-]{1,64}$/;

async function signedIn(): Promise<boolean> {
  return (await auth()).userId !== null;
}

/** Sets an Alert on a followed Market: its first Outcome above or below a Chance (1–99 %). */
export async function createAlert(input: {
  marketId: string;
  direction: Direction;
  chance: number;
}): Promise<CreateAlertResult> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to set alerts." };
  const { marketId, direction, chance } = input ?? {};
  if (typeof marketId !== "string" || !MARKET_ID.test(marketId)) return { ok: false, message: "That isn't a Market." };
  if (direction !== "above" && direction !== "below") return { ok: false, message: "Choose above or below." };
  const threshold = typeof chance === "number" ? parseChance(String(chance)) : null;
  if (threshold === null) return { ok: false, message: "Enter a Chance from 1 to 99 %." };

  const { data, error } = await supabase()
    .from("alerts")
    .insert({ market_id: marketId, direction, threshold })
    .select(ALERT_COLUMNS)
    .single();
  if (!error && data) {
    revalidatePath("/");
    return { ok: true, alert: toAlert(data as Alert) };
  }
  if (error?.message.includes("Alert limit reached (3 per Market)")) {
    return { ok: false, message: "Alert limit reached (3 per Market). Delete one to add another." };
  }
  if (error?.message.includes("Alert limit reached (50)")) {
    return { ok: false, message: "Alert limit reached (50). Delete one to add another." };
  }
  if (error?.code === "23503") return { ok: false, message: "Follow this Market to set an alert on it." };
  console.error("create alert failed", error);
  return { ok: false, message: "Couldn't set that alert. Try again." };
}

/** Deletes one of the caller's Alerts, active or triggered. */
export async function deleteAlert(id: number): Promise<DeleteAlertResult> {
  if (!(await signedIn())) return { ok: false, message: "Sign in first." };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "That isn't an alert." };

  const { error } = await supabase().from("alerts").delete().eq("id", id);
  if (!error) {
    revalidatePath("/");
    return { ok: true };
  }
  console.error("delete alert failed", error);
  return { ok: false, message: "Couldn't delete that alert. Try again." };
}
