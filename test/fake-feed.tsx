// A fake live feed for UI tests: stands in for Supabase + Realtime at the Watchlist's feed seam.
// Tests push Market UPDATEs and new Runs, drop or restore the channel, and answer snapshot refetches.
import { act } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import type { Connection } from "@/components/use-realtime";
import type { UseWatchlistFeed, WatchlistFeedArgs, WatchlistSnapshot } from "@/components/watchlist-feed";
import type { Market } from "@/lib/markets";
import type { Run } from "@/lib/runs";

export type FakeFeed = {
  useFeed: UseWatchlistFeed;
  /** Push a Realtime UPDATE of a Market (only its changed columns are needed). */
  pushMarket(update: Partial<Market> & { id: string }): void;
  /** Push a Realtime INSERT of a Run. */
  pushRun(run: Run): void;
  /** Set the channel's state; "live" counts as a (re)subscribe, which makes the page refetch. */
  setConnection(state: Connection): void;
  /** What the next snapshot refetch returns; its Markets may carry `recent` / `before` price_history rows. */
  snapshot: WatchlistSnapshot;
  /** How many times the page asked for a snapshot. */
  snapshotLoads: number;
};

export function fakeFeed(): FakeFeed {
  let args: WatchlistFeedArgs | null = null;
  let setConn: ((c: Connection) => void) | null = null;

  const feed: FakeFeed = {
    snapshot: { follows: null, runs: null },
    snapshotLoads: 0,
    useFeed(current) {
      const [connection, setConnection] = useState<Connection>("live");
      const latest = useRef(current);
      latest.current = current;
      useEffect(() => {
        args = latest.current;
      });
      useEffect(() => {
        setConn = setConnection;
      }, []);
      return {
        connection,
        loadSnapshot: async () => {
          feed.snapshotLoads += 1;
          return feed.snapshot;
        },
      };
    },
    pushMarket(update) {
      act(() => args!.onMarket(update));
    },
    pushRun(run) {
      act(() => args!.onRun(run));
    },
    setConnection(state) {
      act(() => {
        setConn!(state);
        if (state === "live") args!.onSubscribed();
      });
    },
  };
  return feed;
}
