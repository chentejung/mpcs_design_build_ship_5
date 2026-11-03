"use client";
// The live Watchlist (AGENTS.md → Realtime, Product rule 5). Its feed (components/watchlist-feed.tsx) delivers
// UPDATEs of the followed Markets only (id=in.(…), ≤ 25) and new worker_runs for Freshness. Realtime doesn't
// replay what was missed, so every (re)subscribe refetches the snapshot.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearFinished } from "@/app/actions/follows";
import { FreshnessView, Heartbeat, isMuted } from "@/components/freshness";
import { useNow } from "@/components/use-now";
import { WatchCard } from "@/components/watch-card";
import { useWatchlistFeed } from "@/components/watchlist-feed";
import { freshness } from "@/lib/freshness";
import { mergeRuns, type Run } from "@/lib/runs";
import { applyMarketUpdate, FOLLOW_LIMIT, splitWatchlist, toFollowed, type Followed } from "@/lib/watchlist";

export function WatchlistLive({
  initialItems,
  initialRuns,
  renderedAt,
}: {
  initialItems: Followed[];
  initialRuns: Run[];
  renderedAt: string;
}) {
  const router = useRouter();
  const now = useNow(renderedAt);
  const [items, setItems] = useState(initialItems);
  const [runs, setRuns] = useState(initialRuns);
  const [clearing, startClearing] = useTransition();
  const [ids] = useState(() => initialItems.map((m) => m.id));

  const { connection, loadSnapshot } = useWatchlistFeed({
    marketIds: ids,
    onMarket: (update) => setItems((current) => applyMarketUpdate(current, update)),
    onRun: (run) => setRuns((current) => mergeRuns(current, [run])),
    // Realtime doesn't replay what was missed: on every (re)subscribe, reload what's on screen.
    onSubscribed: () => void refetch(),
  });

  const refetch = async () => {
    const snapshot = await loadSnapshot();
    if (snapshot.follows) {
      const fresh = new Map(toFollowed(snapshot.follows).map((m) => [m.id, m]));
      // Keep each card's last move, so the arrow doesn't vanish on reconnect.
      setItems((current) => current.flatMap((m) => {
        const f = fresh.get(m.id);
        return f ? [{ ...f, move: m.move }] : [];
      }));
    }
    if (snapshot.runs) setRuns((current) => mergeRuns(current, snapshot.runs!));
  };

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
        <div className="flex items-center gap-3">
          <Heartbeat freshness={f} beat={runs[0]?.id} />
          {f.state === "fresh" || f.state === "loading" ? <FreshnessView freshness={f} now={now} /> : null}
        </div>
      </div>
      {f.state === "stale" || f.state === "down" ? (
        <div className="mt-4"><FreshnessView freshness={f} now={now} /></div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium">Follow a Market to start</p>
          <p className="mt-1 text-sm text-dim">Pick up to {FOLLOW_LIMIT} from any Category; they&rsquo;ll update here on their own.</p>
          <Link href="/browse" className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-strong">
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
