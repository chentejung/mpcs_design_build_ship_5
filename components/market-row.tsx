// One Market in Browse: its image, its name, the split bar, "Ends in …", volume, Moved, a link to Polymarket, and Follow.
import { MarketThumb } from "@/components/market-thumb";
import { SplitBar } from "@/components/split-bar";
import { ago, endsIn, polymarketUrl, volume } from "@/lib/format";
import { marketLabel, type Market } from "@/lib/markets";

export function MarketRow({
  market,
  now,
  muted,
  action,
}: {
  market: Market;
  now: Date;
  muted: boolean;
  action: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <MarketThumb id={market.id} image={market.image} category={market.category} size={36} />
        <div className="min-w-0">
          <p className="truncate font-medium" title={market.question}>{marketLabel(market)}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-faint">
            {market.end_date ? <EndLabel text={endsIn(new Date(market.end_date), now, market.category)} /> : null}
            <span className="num">{volume(market.volume_24h)} 24h</span>
            {market.price_changed_at ? <span>Moved {ago(new Date(market.price_changed_at), now)}</span> : null}
            <a href={polymarketUrl(market.slug)} target="_blank" rel="noreferrer" className="hover:text-dim">
              Polymarket ↗
            </a>
          </p>
        </div>
      </div>
      <SplitBar outcomes={market.outcomes} price={market.price} muted={muted} />
      <div className="flex justify-end">{action}</div>
    </li>
  );
}

function EndLabel({ text }: { text: string }) {
  if (text !== "In play") return <span>{text}</span>;
  return <span className="font-semibold text-dim">● In play</span>;
}
