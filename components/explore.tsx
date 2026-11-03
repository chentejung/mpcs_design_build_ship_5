// The trending banner and the globe of Markets by place, shared by the signed-out landing (/) and Explore
// (/explore). Static like Browse: the Catalog is read once per request (markets is readable by anon through RLS)
// and feeds both sections. On Explore it also shows Browse's freshness line, and a signed-in viewer's Follows;
// a signed-out Follow there comes back to /explore?follow=<id> (rule 7). The landing keeps Browse as the way back.
import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { BrowseFreshness } from "@/components/browse-freshness";
import { FollowAfterSignIn } from "@/components/follow-after-sign-in";
import { PlaceExplorer } from "@/components/place-explorer";
import { SIGNED_OUT, type Viewer } from "@/components/place-panel";
import { TrendingBanner } from "@/components/trending-banner";
import type { RunSummary } from "@/lib/freshness";
import { MARKET_COLUMNS, toMarket } from "@/lib/markets";
import type { PlacedMarket } from "@/lib/places";
import { supabase } from "@/lib/supabase";
import { trendingTopics } from "@/lib/trending";

let warnedNoPlaces = false;

/**
 * The live Catalog by 24-hour volume, with each Market's places, read once per request. Until #13's migration adds
 * `markets.places`, that query fails; then it reads without places and every Market is Global.
 */
const catalog = cache(async (): Promise<PlacedMarket[]> => {
  const db = supabase();
  const withPlaces = await db
    .from("markets")
    .select(`${MARKET_COLUMNS}, places`)
    .eq("in_catalog", true)
    .eq("closed", false)
    .order("volume_24h", { ascending: false, nullsFirst: false });
  if (!withPlaces.error) return withPlaces.data.map((m) => ({ ...toMarket(m), places: m.places ?? [] }));

  if (!warnedNoPlaces) {
    warnedNoPlaces = true;
    console.warn(`explore: reading Markets without places, all shown as Global (${withPlaces.error.message})`);
  }
  const { data, error } = await db
    .from("markets")
    .select(MARKET_COLUMNS)
    .eq("in_catalog", true)
    .eq("closed", false)
    .order("volume_24h", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Couldn't load Markets: ${error.message}`);
  return data.map((m) => ({ ...toMarket(m), places: [] }));
});

/** Where the content is shown: the signed-out landing, or the Explore tab. */
export type ExploreOn = "landing" | "explore";

export function ExploreContent({ on }: { on: ExploreOn }) {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <ExploreData on={on} />
    </Suspense>
  );
}

async function ExploreData({ on }: { on: ExploreOn }) {
  await connection();
  if (on === "landing") {
    return <ExploreView markets={await catalog()} renderedAt={new Date().toISOString()} viewer={SIGNED_OUT} runs={null} />;
  }

  const { userId } = await auth();
  const db = supabase();
  const [markets, runs, follows] = await Promise.all([
    catalog(),
    db.from("worker_runs").select("finished_at, ok, skipped, error").order("started_at", { ascending: false }).limit(20),
    // RLS returns only this user's Follows; signed out there are none to ask for.
    userId ? db.from("follows").select("market_id") : Promise.resolve({ data: [], error: null }),
  ]);
  if (runs.error) throw new Error(`Couldn't load the feed status: ${runs.error.message}`);
  if (follows.error) throw new Error(`Couldn't load your Follows: ${follows.error.message}`);
  const signedIn = userId !== null;
  return (
    <>
      <FollowAfterSignIn signedIn={signedIn} />
      <ExploreView
        markets={markets}
        renderedAt={new Date().toISOString()}
        viewer={{ signedIn, followed: follows.data.map((f) => f.market_id), returnTo: "/explore" }}
        runs={runs.data}
      />
    </>
  );
}

/** The banner and the globe from given data: the freshness line first when `runs` is given. */
export function ExploreView({
  markets,
  renderedAt,
  viewer,
  runs,
}: {
  markets: readonly PlacedMarket[];
  renderedAt: string;
  viewer: Viewer;
  runs: RunSummary[] | null;
}) {
  return (
    <div className="space-y-10">
      {runs ? <BrowseFreshness runs={runs} loadedAt={renderedAt} /> : null}
      <TrendingBanner topics={trendingTopics(markets)} />
      <PlaceExplorer markets={markets} renderedAt={renderedAt} viewer={viewer} />
    </div>
  );
}

function ExploreSkeleton() {
  return (
    <div className="space-y-10">
      <div
        role="status"
        aria-label="Loading trending topics"
        className="h-64 animate-pulse rounded-2xl border border-line bg-panel motion-reduce:animate-none"
      />
      <div role="status" aria-label="Loading Markets" className="grid gap-6 lg:grid-cols-2">
        <div className="h-[460px] animate-pulse rounded-2xl bg-raised motion-reduce:animate-none" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-panel motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
