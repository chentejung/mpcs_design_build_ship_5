"use client";
// Both Outcomes as one split bar: "Hawks 62 | 38 Pacers", "Yes 95.5 | 4.5 No" (product rule 2).
// Only the first Outcome's Price is stored; the second side is 1 − Price. The bar is neutral for every
// Market, so the app never looks like it's rooting for a side; direction colour lives in the arrow.
// Product rule 3: when the displayed Chance moves by ≥ 0.1 point (a `move`), both Chances roll to their new
// values and the bar glides; smaller changes don't animate, and with reduced motion nothing does.
import { useReducedMotion } from "@/components/use-reduced-motion";
import { splitChances } from "@/lib/format";

export type Move = { dir: "up" | "down"; seq: number };

export function SplitBar({
  outcomes,
  price,
  muted = false,
  move,
  size = "md",
}: {
  outcomes: readonly string[];
  price: number | null;
  /** Greyed while Stale/Down, or for a Finished Market's frozen split. */
  muted?: boolean;
  /** The last ≥ 0.1-point move; a new seq replays the roll. */
  move?: Move;
  size?: "md" | "lg";
}) {
  const reduced = useReducedMotion();
  const [a, b] = outcomes;
  if (price === null) {
    return (
      <div data-split className="flex items-center justify-between gap-3 text-sm text-faint">
        <span>{a}</span>
        <span className="num">no Price yet</span>
        <span>{b}</span>
      </div>
    );
  }
  const [chanceA, chanceB] = splitChances(price);
  const width = `${Math.min(100, Math.max(0, price * 100))}%`;
  const roll = move && !reduced ? move : null;
  const opposite = roll ? (roll.dir === "up" ? "down" : "up") : null;
  const big = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <div data-split data-motion={reduced ? "off" : "on"} className={muted ? "opacity-50 grayscale" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm text-dim">{a}</span>
          <Chance value={chanceA} roll={roll ? { dir: roll.dir, seq: roll.seq } : null} className={big} />
        </span>
        <span className="flex min-w-0 items-baseline justify-end gap-1.5">
          <Chance value={chanceB} roll={roll && opposite ? { dir: opposite, seq: roll.seq } : null} className={big} />
          <span className="truncate text-sm text-dim">{b}</span>
        </span>
      </div>
      <div
        className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-side-b"
        role="img"
        aria-label={`${a} ${chanceA}% chance, ${b} ${chanceB}% chance`}
      >
        <div
          className="h-full rounded-l-full bg-side-a transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width }}
        />
      </div>
    </div>
  );
}

/** One Chance. On a move its digits roll in from the direction of travel; the key replays it on each move. */
function Chance({
  value,
  roll,
  className,
}: {
  value: string;
  roll: { dir: "up" | "down"; seq: number } | null;
  className: string;
}) {
  return (
    <span className={`num inline-flex overflow-hidden font-bold leading-none text-ink ${className}`}>
      <span
        key={roll?.seq ?? 0}
        data-rolling={roll?.dir}
        className={roll ? (roll.dir === "up" ? "roll-up" : "roll-down") : undefined}
      >
        {value}
      </span>
    </span>
  );
}
