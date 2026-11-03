"use client";
// A Watchlist card's last 24 hours: a sparkline of the first Outcome's Price and its Δ 1h / Δ 24h in Chance
// points (lib/history.ts). The stroke is neutral for every Market; direction colour stays in the card's ▲▼
// (product rule 3). The line draws in once, not under reduced motion, and gains points live; a Finished
// card shows its frozen history, ending when trading ended. Active Alerts are dashed horizontal lines at their
// thresholds, in the neutral accent; the scale stretches to include them.
import { useReducedMotion } from "@/components/use-reduced-motion";
import { splitChances } from "@/lib/format";
import { DAY_MS, delta, formatDelta, HOUR_MS, WINDOW_MS, type PricePoint } from "@/lib/history";
import type { Followed } from "@/lib/watchlist";

const W = 120;
const H = 28;
const PAD = 2;

export function PriceTrend({
  market,
  now,
  muted,
  lines = [],
}: {
  market: Followed;
  now: Date;
  muted: boolean;
  /** Prices (0–1) to mark with a dashed line: the card's active Alerts. */
  lines?: readonly number[];
}) {
  if (market.price === null) return null;
  const history = market.history ?? [];
  // A Finished card is frozen: its line and Δs are as of when trading ended.
  const end = market.closed ? endOf(market, history) : now.getTime();
  const at = new Date(end);
  return (
    <div className={`mt-2 flex items-center gap-3 ${muted ? "opacity-50 grayscale" : ""}`}>
      <Sparkline
        outcome={market.outcomes[0]}
        history={history}
        price={market.price}
        end={end}
        lines={lines}
      />
      <p className="num flex flex-wrap gap-x-3 text-xs text-dim">
        <span title="Change in Chance points over the last hour">Δ 1h {formatDelta(delta(history, market.price, at, HOUR_MS))}</span>
        <span title="Change in Chance points over the last 24 hours">Δ 24h {formatDelta(delta(history, market.price, at, DAY_MS))}</span>
      </p>
    </div>
  );
}

/** A Finished Market's history ends when trading ended (or at its last point). */
function endOf(market: Followed, history: readonly PricePoint[]): number {
  const closed = market.closed_at ? new Date(market.closed_at).getTime() : NaN;
  if (Number.isFinite(closed)) return closed;
  return history.at(-1)?.at ?? Date.now();
}

function Sparkline({
  outcome,
  history,
  price,
  end,
  lines,
}: {
  outcome: string;
  history: readonly PricePoint[];
  price: number;
  end: number;
  lines: readonly number[];
}) {
  const reduced = useReducedMotion();
  const start = end - WINDOW_MS;
  const prices = [...history.map((p) => p.price), price, ...lines];
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  if (hi - lo < 0.01) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.005;
    hi = mid + 0.005;
  }
  const x = (at: number) => (Math.min(Math.max(at, start), end) - start) / WINDOW_MS * W;
  const y = (p: number) => H - PAD - ((p - lo) / (hi - lo)) * (H - 2 * PAD);

  // Prices hold until they change, so the line steps: across to the next point's time, then to its Price.
  const first = history[0]?.price ?? price;
  let d = `M${fmt(history.length ? x(history[0].at) : 0)} ${fmt(y(first))}`;
  for (const p of history.slice(1)) d += ` H${fmt(x(p.at))} V${fmt(y(p.price))}`;
  d += ` H${W} V${fmt(y(price))}`;

  const [from] = splitChances(first);
  const [to] = splitChances(price);
  const label =
    from === to && history.length <= 1
      ? `${outcome} over 24 hours: steady at ${to}`
      : `${outcome} over 24 hours: from ${from} to ${to}`;

  return (
    <svg
      role="img"
      aria-label={label}
      data-points={history.length}
      data-motion={reduced ? "off" : "on"}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="shrink-0 overflow-visible text-side-a"
    >
      {lines.map((t) => (
        <line
          key={t}
          data-spark-alert-line={t}
          x1={0}
          x2={W}
          y1={fmt(y(t))}
          y2={fmt(y(t))}
          strokeWidth={1}
          strokeDasharray="3 2"
          className="stroke-accent"
        />
      ))}
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={reduced ? undefined : "spark-draw"}
      />
    </svg>
  );
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
