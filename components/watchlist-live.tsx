"use client";
// The live Watchlist (AGENTS.md → Realtime, Product rule 5). It subscribes to UPDATEs of the followed Markets only
// (id=in.(…), ≤ 25) and to new worker_runs for Freshness. Realtime doesn't replay what was missed, so every
// (re)subscribe refetches the snapshot. The Clerk session token makes RLS apply to the subscription.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { clearFinished } from "@/app/actions/follows";
import { FreshnessView, isMuted } from "@/components/freshness";
import { useNow } from "@/components/use-now";
import { WatchCard } from "@/components/watch-card";
import { freshness } from "@/lib/freshness";
import { MARKET_COLUMNS, type Market } from "@/lib/markets";
import { mergeRuns, RUN_COLUMNS, RUN_LOG_SIZE, type Run } from "@/lib/runs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import {
  applyMarketUpdate,
  FOLLOW_LIMIT,
  marketsFilter,
  splitWatchlist,
  toFollowed,
  type FollowRow,
  type Followed,
} from "@/lib/watchlist";

type Connection = "connecting" | "live" | "lost";

export function WatchlistLive({
  initialItems,
  initialRuns,
  renderedAt,
}: {
  initialItems: Followed[];
  initialRuns: Run[];
  renderedAt: string;
}) {
  const db = useSupabaseBrowser();
  const router = useRouter();
  const now = useNow(renderedAt);
  const [items, setItems] = useState(initialItems);
  const [runs, setRuns] = useState(initialRuns);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [clearing, startClearing] = useTransition();
  const [ids] = useState(() => initialItems.map((m) => m.id));

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    // Realtime doesn't replay what was missed: on every (re)subscribe, reload what's on screen.
    const refetch = async () => {
      const [follows, latest] = await Promise.all([
        db.from("follows").select(`created_at, markets!inner(${MARKET_COLUMNS})`).order("created_at"),
        db.from("worker_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(RUN_LOG_SIZE),
      ]);
      if (cancelled) return;
      if (follows.data) {
        const fresh = new Map(toFollowed(follows.data as unknown as FollowRow[]).map((m) => [m.id, m]));
        // Keep each card's last move, so the arrow doesn't vanish on reconnect.
        setItems((current) => current.flatMap((m) => {
          const f = fresh.get(m.id);
          return f ? [{ ...f, move: m.move }] : [];
        }));
      }
      if (latest.data) setRuns((current) => mergeRuns(current, latest.data));
    };

    let channel = db.channel("watchlist");
    const filter = marketsFilter(ids);
    if (filter) {
      channel = channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "markets", filter }, (payload) => {
        setItems((current) => applyMarketUpdate(current, payload.new as Partial<Market> & { id: string }));
      });
    }
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        setRuns((current) => mergeRuns(current, [payload.new as Run]));
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refetch();
        } else {
          setConnection("lost");
        }
      });

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [db, ids]);

  const f = freshness(runs, now, connection !== "lost");
  const muted = isMuted(f);
  const { live, finished } = splitWatchlist(items);

  const clear = () =>
    startClearing(async () => {
      await clearFinished();
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
          <p className="num mt-1 text-xs text-faint">{items.length} of {FOLLOW_LIMIT} followed</p>
        </div>
        {f.state === "fresh" || f.state === "loading" ? <FreshnessView freshness={f} now={now} /> : null}
      </div>
      {f.state === "stale" || f.state === "down" ? (
        <div className="mt-4"><FreshnessView freshness={f} now={now} /></div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium">Follow a Market to start</p>
          <p className="mt-1 text-sm text-dim">Pick up to {FOLLOW_LIMIT} from Politics, Sports and Crypto; they&rsquo;ll update here on their own.</p>
          <Link href="/browse" className="mt-4 inline-block rounded-md bg-side-a px-4 py-2 text-sm font-semibold text-desk hover:bg-ink">
            Browse Markets
          </Link>
        </div>
      ) : (
        <>
          {live.length > 0 ? (
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {live.map((m) => <WatchCard key={m.id} market={m} now={now} muted={muted} />)}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-dim">
              Nothing live right now. <Link href="/browse" className="text-ink underline underline-offset-2">Browse Markets</Link>
            </p>
          )}

          {finished.length > 0 ? (
            <details className="mt-8 rounded-lg border border-line">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-dim">
                Finished ({finished.length})
              </summary>
              <div className="border-t border-line px-4 py-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clear}
                    disabled={clearing}
                    className="rounded-md border border-line px-3 py-1 text-xs text-dim hover:text-ink disabled:opacity-50"
                  >
                    {clearing ? "Clearing…" : "Clear finished"}
                  </button>
                </div>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {finished.map((m) => <WatchCard key={m.id} market={m} now={now} muted={false} />)}
                </ul>
              </div>
            </details>
          ) : null}
        </>
      )}
    </>
  );
}
