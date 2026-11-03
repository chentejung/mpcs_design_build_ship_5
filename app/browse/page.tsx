import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrowseFreshness } from "@/components/browse-freshness";
import { BrowseCard } from "@/components/browse-card";
import { CategoryTabs } from "@/components/category-tabs";
import { FollowAfterSignIn } from "@/components/follow-after-sign-in";
import { freshness } from "@/lib/freshness";
import { CATEGORIES, groupByEvent, MARKET_COLUMNS, toCategory, toMarket, type EventGroup, type Market } from "@/lib/markets";
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
  const sections = toSections(groups);
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
        <p className="mt-10 rounded-xl border border-line bg-panel px-4 py-8 text-center text-dim shadow-card">
          No {CATEGORIES.find((c) => c.slug === category)!.label} Markets right now. Most end within the hour on
          busy nights; try again shortly.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {sections.map((g) => (
            <section key={g.key} aria-label={g.title ?? undefined}>
              {g.title ? <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">{g.title}</h2> : null}
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.markets.map((m) => (
                  <BrowseCard
                    key={m.id}
                    market={m}
                    now={now}
                    muted={muted}
                    followed={followed.has(m.id)}
                    signedIn={signedIn}
                    returnTo={returnTo}
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

type Section = { key: string; title: string | null; markets: Market[] };

/** Events with a heading get their own grid; runs of heading-less single-Market Events share one, in order. */
function toSections(groups: EventGroup[]): Section[] {
  const sections: Section[] = [];
  for (const g of groups) {
    const last = sections.at(-1);
    if (g.showHeading) sections.push({ key: g.key, title: g.title, markets: g.markets });
    else if (last && last.title === null) last.markets.push(...g.markets);
    else sections.push({ key: g.key, title: null, markets: [...g.markets] });
  }
  return sections;
}

function BrowseSkeleton() {
  return (
    <div role="status" aria-label="Loading Markets" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-line bg-panel motion-reduce:animate-none" />
      ))}
    </div>
  );
}
