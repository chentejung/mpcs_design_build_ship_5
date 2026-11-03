// The signed-out landing page: the top-5 trending banner first, then the globe of Markets by place with its list of
// places, the selected place's Markets and the Global shelf, then what Odds Desk is. Static like Browse: the Catalog
// is read once per request as anon (markets is readable by anon through RLS) and feeds every section.
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { PlaceExplorer } from "@/components/place-explorer";
import { TrendingBanner } from "@/components/trending-banner";
import { MARKET_COLUMNS, toMarket } from "@/lib/markets";
import type { PlacedMarket } from "@/lib/places";
import { supabase } from "@/lib/supabase";
import { trendingTopics } from "@/lib/trending";

let warnedNoPlaces = false;

/**
 * The live Catalog by 24-hour volume, with each Market's places, read once per request however many sections use
 * it. Until #13's migration adds `markets.places`, that query fails; then it reads without places and every Market
 * is Global.
 */
const catalog = cache(async (): Promise<PlacedMarket[]> => {
  await connection();
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
    console.warn(`landing: reading Markets without places, all shown as Global (${withPlaces.error.message})`);
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

export function Landing() {
  return (
    <div className="space-y-10 pt-2">
      <h1 className="sr-only">Odds Desk</h1>
      <Suspense fallback={<BannerSkeleton />}>
        <TrendingNow />
      </Suspense>
      <Suspense fallback={<ExplorerSkeleton />}>
        <PlacesNow />
      </Suspense>
      <section aria-labelledby="about" className="max-w-2xl border-t border-line pt-8">
        <h2 id="about" className="text-2xl font-semibold tracking-tight">
          Watch the crowd&rsquo;s Chance move, live.
        </h2>
        <p className="mt-3 text-dim">
          Odds Desk follows Polymarket&rsquo;s busiest Markets in Politics, Sports, Crypto, Finance, Tech, World and
          Culture. Follow up to 25 and your Watchlist updates on its own every few seconds, with a clear sign when the
          data is fresh, stale or down.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/browse"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-card hover:bg-accent-strong"
          >
            Browse Markets
          </Link>
          <Link
            href="/status"
            className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-dim hover:text-ink"
          >
            See the feed status
          </Link>
        </div>
      </section>
    </div>
  );
}

async function TrendingNow() {
  return <TrendingBanner topics={trendingTopics(await catalog())} />;
}

async function PlacesNow() {
  const markets = await catalog();
  return <PlaceExplorer markets={markets} renderedAt={new Date().toISOString()} />;
}

function BannerSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading trending topics"
      className="h-64 animate-pulse rounded-2xl border border-line bg-panel motion-reduce:animate-none"
    />
  );
}

function ExplorerSkeleton() {
  return (
    <div role="status" aria-label="Loading Markets" className="grid gap-6 lg:grid-cols-2">
      <div className="mx-auto aspect-square w-full max-w-[460px] animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-panel motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
