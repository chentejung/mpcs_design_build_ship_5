// A few of the busiest Markets on the signed-out landing page, each with its split (product rule 2), each a
// link to its Category in Browse, where it can be followed. Presentational: the landing page reads them as anon.
import Link from "next/link";
import { MarketThumb } from "@/components/market-thumb";
import { SplitBar } from "@/components/split-bar";
import { marketLabel, type Market } from "@/lib/markets";

export function TopMarkets({ markets }: { markets: readonly Market[] }) {
  if (markets.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel px-4 py-8 text-center text-dim shadow-card">
        No Markets yet. The feed fills them in within a few minutes.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {markets.map((m) => {
        const label = marketLabel(m);
        return (
          <li key={m.id}>
            <Link
              href={`/browse?category=${m.category}`}
              className="flex h-full flex-col rounded-xl border border-line bg-panel p-4 shadow-card transition-colors hover:border-accent"
            >
              <div className="flex items-start gap-3">
                <MarketThumb id={m.id} image={m.image} category={m.category} size={40} />
                <span className="min-w-0 flex-1">
                  {m.event_title && m.event_title !== label ? (
                    <span className="block truncate text-xs text-faint">{m.event_title}</span>
                  ) : null}
                  <span className="line-clamp-2 font-medium leading-snug" title={m.question}>
                    {label}
                  </span>
                </span>
              </div>
              <div className="mt-auto pt-4">
                <SplitBar outcomes={m.outcomes} price={m.price} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
