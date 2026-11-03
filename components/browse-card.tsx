// One Market in Browse as a card: its image, its name, both Outcomes as a split, "Ends in …" (or In play /
// Still trading), 24-hour volume, Moved, a link to Polymarket, and Follow (product rules 1, 2, 6, 7).
// Presentational: the page passes the Market and the viewer's state, so it is component-tested.
import { FollowButton } from "@/components/follow-button";
import { MarketThumb } from "@/components/market-thumb";
import { SplitBar } from "@/components/split-bar";
import { ago, endsIn, polymarketUrl, volume } from "@/lib/format";
import { marketLabel, type Market } from "@/lib/markets";

export function BrowseCard({
  market,
  now,
  muted,
  followed,
  signedIn,
  returnTo,
}: {
  market: Market;
  now: Date;
  /** Chances greyed while the feed was Stale/Down at page load. */
  muted: boolean;
  followed: boolean;
  signedIn: boolean;
  /** This Browse page's URL, to come back to after sign-in. */
  returnTo: string;
}) {
  const label = marketLabel(market);
  return (
    <li className="flex flex-col rounded-xl border border-line bg-panel p-4 shadow-card transition-shadow hover:border-accent-soft">
      <div className="flex items-start gap-3">
        <MarketThumb id={market.id} image={market.image} category={market.category} size={44} />
        <p className="line-clamp-2 min-w-0 flex-1 font-medium leading-snug" title={market.question}>
          {label}
        </p>
      </div>

      <div className="mt-4">
        <SplitBar outcomes={market.outcomes} price={market.price} muted={muted} />
      </div>

      <p className="mt-3 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-faint">
        {market.end_date ? <EndLabel text={endsIn(new Date(market.end_date), now, market.category)} /> : null}
        <span className="num">{volume(market.volume_24h)} 24h</span>
        {market.price_changed_at ? <span>Moved {ago(new Date(market.price_changed_at), now)}</span> : null}
      </p>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <a
          href={polymarketUrl(market.slug)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-faint hover:text-dim"
        >
          Polymarket ↗
        </a>
        <FollowButton
          marketId={market.id}
          label={label}
          followed={followed}
          signedIn={signedIn}
          returnTo={returnTo}
        />
      </div>
    </li>
  );
}

function EndLabel({ text }: { text: string }) {
  if (text !== "In play") return <span>{text}</span>;
  return <span className="font-semibold text-dim">● In play</span>;
}
