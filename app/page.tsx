import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { WatchlistLive } from "@/components/watchlist-live";
import { MARKET_COLUMNS } from "@/lib/markets";
import { RUN_COLUMNS, RUN_LOG_SIZE } from "@/lib/runs";
import { supabase } from "@/lib/supabase";
import { toFollowed, type FollowRow } from "@/lib/watchlist";

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
  const [follows, runs] = await Promise.all([
    // RLS returns only this user's Follows.
    db.from("follows").select(`created_at, markets!inner(${MARKET_COLUMNS})`).order("created_at"),
    db.from("worker_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(RUN_LOG_SIZE),
  ]);
  if (follows.error) throw new Error(`Couldn't load your Watchlist: ${follows.error.message}`);
  if (runs.error) throw new Error(`Couldn't load the feed status: ${runs.error.message}`);

  const items = toFollowed(follows.data as unknown as FollowRow[]);
  // A new set of Follows starts a fresh live view with its own Realtime filter.
  return (
    <WatchlistLive
      key={items.map((m) => m.id).join(",")}
      initialItems={items}
      initialRuns={runs.data}
      renderedAt={new Date().toISOString()}
    />
  );
}

function Landing() {
  return (
    <section className="max-w-2xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Watch the crowd&rsquo;s Chance move, live.</h1>
      <p className="mt-4 text-dim">
        Odds Desk follows Polymarket&rsquo;s busiest Markets in Politics, Sports, Crypto, Finance, Tech, World and Culture. Follow up to 25 and your
        Watchlist updates on its own every few seconds, with a clear sign when the data is fresh, stale or down.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/browse" className="rounded-md bg-side-a px-4 py-2 text-sm font-semibold text-desk hover:bg-ink">
          Browse Markets
        </Link>
        <Link href="/status" className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:text-ink">
          See the feed status
        </Link>
      </div>
    </section>
  );
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
