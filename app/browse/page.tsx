import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrowseFreshness } from "@/components/browse-freshness";
import { FollowAfterSignIn } from "@/components/follow-after-sign-in";
import { FollowButton } from "@/components/follow-button";
import { MarketRow } from "@/components/market-row";
import { freshness } from "@/lib/freshness";
import { CATEGORIES, groupByEvent, MARKET_COLUMNS, marketLabel, toCategory, toMarket, type CategorySlug } from "@/lib/markets";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Browse" };

const ENDING_SOON_MS = 60 * 60_000;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Browse (product rule 6): one Category, grouped by Event, by 24-hour volume, hiding Markets that end within
// the next hour (games already in play stay, marked In play). Static: read once per request, open to signed-out visitors (anon can read markets). Signed in, each
// Market shows Follow or Following; signed out, Follow opens sign-in and follows on return.
export default function BrowsePage({ searchParams }: Props) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Browse</h1>
      <Suspense fallback={<BrowseSkeleton />}>
        <BrowseCategory searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BrowseCategory({ searchParams }: Props) {
  const category = toCategory((await searchParams).category);
  await connection();
  const now = new Date();
  const { userId } = await auth();
  const db = supabase();
  const [markets, runs, follows] = await Promise.all([
    db.from("markets").select(MARKET_COLUMNS)
      .eq("category", category).eq("in_catalog", true).eq("closed", false)
      // Hide Markets ending within the next hour; ones past their end date that still trade (games in play) stay.
      .or(`end_date.is.null,end_date.lte.${now.toISOString()},end_date.gt.${new Date(now.getTime() + ENDING_SOON_MS).toISOString()}`)
      .order("volume_24h", { ascending: false, nullsFirst: false }),
    db.from("worker_runs").select("finished_at, ok, skipped, error").order("started_at", { ascending: false }).limit(20),
    // RLS returns only this user's Follows; signed out there are none to ask for.
    userId ? db.from("follows").select("market_id") : Promise.resolve({ data: [], error: null }),
  ]);
  if (markets.error) throw new Error(`Couldn't load Markets: ${markets.error.message}`);
  if (runs.error) throw new Error(`Couldn't load the feed status: ${runs.error.message}`);
  if (follows.error) throw new Error(`Couldn't load your Follows: ${follows.error.message}`);
  const followed = new Set(follows.data.map((f) => f.market_id));
  const signedIn = userId !== null;
  const returnTo = `/browse?category=${category}`;

  const groups = groupByEvent(markets.data.map(toMarket));
  const f = freshness(runs.data, now, true);
  const muted = f.state === "stale" || f.state === "down";

  return (
    <>
      <CategoryTabs current={category} />
      <FollowAfterSignIn signedIn={signedIn} />
      <div className="mt-4">
        <BrowseFreshness runs={runs.data} loadedAt={now.toISOString()} />
      </div>
      {groups.length === 0 ? (
        <p className="mt-10 rounded-lg border border-line bg-panel px-4 py-8 text-center text-dim">
          No {CATEGORIES.find((c) => c.slug === category)!.label} Markets right now. Most end within the hour on
          busy nights; try again shortly.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title} className="overflow-hidden rounded-lg border border-line bg-panel">
              {g.showHeading ? (
                <h2 className="border-b border-line bg-raised/50 px-4 py-2 text-sm font-semibold text-dim">{g.title}</h2>
              ) : null}
              <ul className="divide-y divide-line">
                {g.markets.map((m) => (
                  <MarketRow
                    key={m.id}
                    market={m}
                    now={now}
                    muted={muted}
                    action={
                      <FollowButton
                        marketId={m.id}
                        label={marketLabel(m)}
                        followed={followed.has(m.id)}
                        signedIn={signedIn}
                        returnTo={returnTo}
                      />
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function CategoryTabs({ current }: { current: CategorySlug }) {
  return (
    <nav aria-label="Category" className="mt-4 flex gap-1 border-b border-line">
      {CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={`/browse?category=${c.slug}`}
          aria-current={c.slug === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            c.slug === current ? "border-side-a text-ink" : "border-transparent text-dim hover:text-ink"
          }`}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}

function BrowseSkeleton() {
  return (
    <div role="status" aria-label="Loading Markets" className="mt-6 space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-line bg-panel motion-reduce:animate-none" />
      ))}
    </div>
  );
}
