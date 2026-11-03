import Link from "next/link";

// Signed out: a short landing page. Signed in (once Clerk is added): the live Watchlist.
export default function Home() {
  return (
    <section className="max-w-2xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Watch the crowd&rsquo;s Chance move, live.</h1>
      <p className="mt-4 text-dim">
        Odds Desk follows Polymarket&rsquo;s busiest Politics, Sports and Crypto Markets. Follow up to 25 and your
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
