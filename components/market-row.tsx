// One Market in Browse: its name, the split bar, "Ends in …", volume, Moved, and a link to Polymarket.
// Follow (and sign-in-then-follow) is added with Clerk.
import { SplitBar } from "@/components/split-bar";
import { ago, endsIn, polymarketUrl, volume } from "@/lib/format";
import { marketLabel, type Market } from "@/lib/markets";

export function MarketRow({ market, now, muted }: { market: Market; now: Date; muted: boolean }) {
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="truncate font-medium" title={market.question}>{marketLabel(market)}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-faint">
          {market.end_date ? <span>{endsIn(new Date(market.end_date), now)}</span> : null}
          <span className="num">{volume(market.volume_24h)} 24h</span>
          {market.price_changed_at ? <span>Moved {ago(new Date(market.price_changed_at), now)}</span> : null}
          <a href={polymarketUrl(market.slug)} target="_blank" rel="noreferrer" className="hover:text-dim">
            Polymarket ↗
          </a>
        </p>
      </div>
      <SplitBar outcomes={market.outcomes} price={market.price} muted={muted} />
    </li>
  );
}
