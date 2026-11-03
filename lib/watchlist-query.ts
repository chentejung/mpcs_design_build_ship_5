// The Watchlist's read of the user's Follows, shared by the server's first render and the browser's snapshot
// refetch. RLS returns only this user's Follows (app code never filters by user_id) and lets `authenticated` read
// price_history. Each Market comes with its price_history: `recent`, the last 24 h (newest first, at most
// HISTORY_FETCH_LIMIT rows), and `before`, the last row before then, so Δ 24h has a starting Price.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { HISTORY_FETCH_LIMIT, WINDOW_MS } from "./history";
import { MARKET_COLUMNS } from "./markets";

const HISTORY = "price, recorded_at";

export function selectFollows(db: SupabaseClient<Database>, now: Date) {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  return db
    .from("follows")
    .select(
      `created_at, markets!inner(${MARKET_COLUMNS}, recent:price_history(${HISTORY}), before:price_history(${HISTORY}))`,
    )
    .gt("markets.recent.recorded_at", since)
    .order("recorded_at", { referencedTable: "markets.recent", ascending: false })
    .limit(HISTORY_FETCH_LIMIT, { referencedTable: "markets.recent" })
    .lte("markets.before.recorded_at", since)
    .order("recorded_at", { referencedTable: "markets.before", ascending: false })
    .limit(1, { referencedTable: "markets.before" })
    .order("created_at");
}

/**
 * For the Recap: each followed Market's last price_history row at or before `at` (lib/recap.ts → recapStart).
 * Read once per page load on the server; RLS again limits it to this user's Follows.
 */
export function selectPricesAt(db: SupabaseClient<Database>, at: string) {
  return db
    .from("follows")
    .select(`market_id, markets!inner(at_visit:price_history(${HISTORY}))`)
    .lte("markets.at_visit.recorded_at", at)
    .order("recorded_at", { referencedTable: "markets.at_visit", ascending: false })
    .limit(1, { referencedTable: "markets.at_visit" });
}
