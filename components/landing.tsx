// The signed-out landing page: what Odds Desk is, a link to Browse, and a few of the busiest Markets right now
// with their split, read as anon (markets is readable by anon through RLS).
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TopMarkets } from "@/components/top-markets";
import { MARKET_COLUMNS, toMarket } from "@/lib/markets";
import { supabase } from "@/lib/supabase";

const TOP_MARKETS = 6;

export function Landing() {
  return (
    <>
      <section className="max-w-2xl py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Watch the crowd&rsquo;s Chance move, live.</h1>
        <p className="mt-4 text-dim">
          Odds Desk follows Polymarket&rsquo;s busiest Markets in Politics, Sports, Crypto, Finance, Tech, World and
          Culture. Follow up to 25 and your Watchlist updates on its own every few seconds, with a clear sign when the
          data is fresh, stale or down.
        </p>
        <div className="mt-8 flex gap-3">
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
      <section aria-labelledby="top-markets">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="top-markets" className="text-base font-semibold tracking-tight">
            Busiest Markets right now
          </h2>
          <Link href="/browse" className="text-sm font-medium text-accent hover:text-accent-strong">
            See all in Browse →
          </Link>
        </div>
        <Suspense fallback={<TopMarketsSkeleton />}>
          <TopMarketsNow />
        </Suspense>
      </section>
    </>
  );
}

async function TopMarketsNow() {
  await connection();
  const { data, error } = await supabase()
    .from("markets")
    .select(MARKET_COLUMNS)
    .eq("in_catalog", true)
    .eq("closed", false)
    .order("volume_24h", { ascending: false, nullsFirst: false })
    .limit(TOP_MARKETS);
  if (error) throw new Error(`Couldn't load Markets: ${error.message}`);
  return <TopMarkets markets={data.map(toMarket)} />;
}

function TopMarketsSkeleton() {
  return (
    <div role="status" aria-label="Loading Markets" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: TOP_MARKETS }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-panel motion-reduce:animate-none" />
      ))}
    </div>
  );
}
