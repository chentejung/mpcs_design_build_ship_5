"use client";
// The live Watchlist's feed seam: where its snapshot and Realtime changes come from. The real feed is Supabase
// (the browser client, through RLS) plus one Realtime channel on `markets` UPDATEs (filtered to the followed
// ids) and `worker_runs` INSERTs. UI tests provide a fake through WatchlistFeedProvider.
import { createContext, useContext } from "react";
import { useRealtimeChannel, type Connection } from "@/components/use-realtime";
import { MARKET_COLUMNS, type Market } from "@/lib/markets";
import { RUN_COLUMNS, RUN_LOG_SIZE, type Run } from "@/lib/runs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import { marketsFilter, type FollowRow } from "@/lib/watchlist";

export type WatchlistSnapshot = { follows: FollowRow[] | null; runs: Run[] | null };

export type WatchlistFeedArgs = {
  /** The followed Market ids, fixed for the life of the view. */
  marketIds: readonly string[];
  onMarket(update: Partial<Market> & { id: string }): void;
  onRun(run: Run): void;
  /** Every (re)subscribe: Realtime doesn't replay what was missed, so the page refetches. */
  onSubscribed(): void;
};

export type WatchlistFeed = {
  connection: Connection;
  /** The user's Follows (RLS) and the latest Runs, or nulls if they couldn't be read. */
  loadSnapshot(): Promise<WatchlistSnapshot>;
};

export type UseWatchlistFeed = (args: WatchlistFeedArgs) => WatchlistFeed;

export const useSupabaseWatchlistFeed: UseWatchlistFeed = ({ marketIds, onMarket, onRun, onSubscribed }) => {
  const db = useSupabaseBrowser();
  const filter = marketsFilter(marketIds);
  const connection = useRealtimeChannel(
    db,
    `watchlist:${marketIds.join(",")}`,
    (channel) => {
      const withMarkets = filter
        ? channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "markets", filter }, (payload) =>
            onMarket(payload.new as Partial<Market> & { id: string }),
          )
        : channel;
      return withMarkets.on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) =>
        onRun(payload.new as Run),
      );
    },
    onSubscribed,
  );

  const loadSnapshot = async (): Promise<WatchlistSnapshot> => {
    if (!db) return { follows: null, runs: null };
    const [follows, runs] = await Promise.all([
      db.from("follows").select(`created_at, markets!inner(${MARKET_COLUMNS})`).order("created_at"),
      db.from("worker_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(RUN_LOG_SIZE),
    ]);
    return { follows: (follows.data as unknown as FollowRow[] | null) ?? null, runs: runs.data ?? null };
  };

  return { connection, loadSnapshot };
};

const FeedContext = createContext<UseWatchlistFeed>(useSupabaseWatchlistFeed);

export const WatchlistFeedProvider = FeedContext.Provider;

/** The feed in use: the real Supabase one unless a provider supplies another. */
export function useWatchlistFeed(args: WatchlistFeedArgs): WatchlistFeed {
  const useFeed = useContext(FeedContext);
  return useFeed(args);
}
