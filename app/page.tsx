import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { Landing } from "@/components/landing";
import { RecapScope } from "@/components/recap";
import { WatchlistLive } from "@/components/watchlist-live";
import { recap, recapStart, toPricesAtVisit, type PriceAtVisitRow, type Recap } from "@/lib/recap";
import { RUN_COLUMNS, RUN_LOG_SIZE } from "@/lib/runs";
import { supabase } from "@/lib/supabase";
import { toFollowed, type Followed, type FollowRow } from "@/lib/watchlist";
import { selectFollows, selectPricesAt } from "@/lib/watchlist-query";

// Signed out: a short landing page. Signed in: the live Watchlist.
export default function Home() {
  return (
    <Suspense fallback={<WatchlistSkeleton />}>
      <HomeForViewer />
    </Suspense>
  );
}

async function HomeForViewer() {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  await connection();
  const db = supabase();
  const now = new Date();
  const [follows, runs, visit] = await Promise.all([
    // RLS returns only this user's Follows, each with its last 24 h of price_history.
    selectFollows(db, now),
    db.from("worker_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(RUN_LOG_SIZE),
    // The previous visit (RLS: only this user's row). RecapScope records this one after the page is shown.
    db.from("visits").select("last_seen_at").maybeSingle(),
  ]);
  if (follows.error) throw new Error(`Couldn't load your Watchlist: ${follows.error.message}`);
  if (runs.error) throw new Error(`Couldn't load the feed status: ${runs.error.message}`);

  const items = toFollowed(follows.data as unknown as FollowRow[]);
  const recap = await loadRecap(db, items, visit.error ? null : (visit.data?.last_seen_at ?? null), now);
  // A new set of Follows starts a fresh live view with its own Realtime filter; the Recap stays as first shown.
  return (
    <RecapScope recap={recap}>
      <WatchlistLive
        key={items.map((m) => m.id).join(",")}
        initialItems={items}
        initialRuns={runs.data}
        renderedAt={new Date().toISOString()}
      />
    </RecapScope>
  );
}

/** The Recap since the previous visit. A failed read only loses the Recap, never the Watchlist. */
async function loadRecap(db: ReturnType<typeof supabase>, items: Followed[], lastSeenAt: string | null, now: Date): Promise<Recap> {
  if (!lastSeenAt || items.length === 0) return recap({ items, lastSeenAt, pricesAtVisit: {}, now });
  const prices = await selectPricesAt(db, recapStart(lastSeenAt, now));
  if (prices.error) {
    console.error("recap: load failed", prices.error);
    return { kind: "none" };
  }
  return recap({ items, lastSeenAt, pricesAtVisit: toPricesAtVisit(prices.data as unknown as PriceAtVisitRow[]), now });
}

function WatchlistSkeleton() {
  return (
    <div role="status" aria-label="Loading your Watchlist">
      <div className="h-8 w-40 animate-pulse rounded bg-raised motion-reduce:animate-none" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-line bg-panel motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
