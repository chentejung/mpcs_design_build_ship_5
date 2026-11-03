"use client";
// One followed Market on the Watchlist: its image, Event › Market, the split bar (Chances roll on a move), a ▲▼,
// Moved, and Unfollow. Green/red only on Yes/No Markets (product rule 3); a Finished card shows its frozen split.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unfollow } from "@/app/actions/follows";
import { MarketThumb } from "@/components/market-thumb";
import { SplitBar } from "@/components/split-bar";
import { ago, isYesNo, polymarketUrl } from "@/lib/format";
import { marketLabel } from "@/lib/markets";
import type { Followed } from "@/lib/watchlist";

export function WatchCard({ market, now, muted }: { market: Followed; now: Date; muted: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const label = marketLabel(market);
  const yesNo = isYesNo(market.outcomes);
  const move = market.move;
  const arrowColour = !move ? "" : yesNo ? (move.dir === "up" ? "text-up" : "text-down") : "text-dim";

  const remove = () =>
    startTransition(async () => {
      const result = await unfollow(market.id);
      if (!result.ok) setMessage(result.message);
      router.refresh();
    });

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-panel shadow-card">
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <MarketThumb id={market.id} image={market.image} category={market.category} />
          <div className="min-w-0 flex-1">
            {market.event_title && market.event_title !== label ? (
              <p className="truncate text-xs text-faint">{market.event_title} ›</p>
            ) : null}
            <p className="truncate font-medium" title={market.question}>{label}</p>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Unfollow ${label}`}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-faint hover:bg-raised hover:text-ink disabled:opacity-50"
          >
            {pending ? "…" : "Unfollow"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <SplitBar
              outcomes={market.outcomes}
              price={market.price}
              muted={muted || market.closed}
              move={market.closed ? undefined : move}
              size="lg"
            />
          </div>
          {move && !market.closed ? (
            <span
              role="img"
              aria-label={move.dir === "up" ? "Moved up" : "Moved down"}
              data-tone={yesNo ? move.dir : "neutral"}
              className={`num w-4 text-center text-sm ${arrowColour}`}
            >
              {move.dir === "up" ? "▲" : "▼"}
            </span>
          ) : (
            <span className="w-4" aria-hidden />
          )}
        </div>

        <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-faint">
          {market.closed ? (
            <span>Trading ended{market.closed_at ? ` ${ago(new Date(market.closed_at), now)}` : ""} · final split</span>
          ) : market.price_changed_at ? (
            <span>Moved <span className="num">{ago(new Date(market.price_changed_at), now)}</span></span>
          ) : (
            <span>Hasn&rsquo;t moved yet</span>
          )}
          <a href={polymarketUrl(market.slug)} target="_blank" rel="noreferrer" className="hover:text-dim">
            View on Polymarket ↗
          </a>
        </p>
        {message ? <p role="alert" className="mt-1 text-xs text-stale">{message}</p> : null}
        {move && !market.closed ? (
          <span className="sr-only" aria-live="polite">
            {label} {move.dir === "up" ? "up" : "down"}
          </span>
        ) : null}
      </div>
    </li>
  );
}
