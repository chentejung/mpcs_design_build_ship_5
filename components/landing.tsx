// The signed-out landing page: Explore's content (the top-5 trending banner, then the globe of Markets by place with
// its list of places, the selected place's Markets and the Global shelf), then what Odds Desk is. Signed in, the
// same content is the Explore tab (/explore).
import Link from "next/link";
import { ExploreContent } from "@/components/explore";

export function Landing() {
  return (
    <div className="space-y-10 pt-2">
      <h1 className="sr-only">Odds Desk</h1>
      <ExploreContent on="landing" />
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
            href="/explore"
            className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-dim hover:text-ink"
          >
            Open Explore
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
