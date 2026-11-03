// Both Outcomes as one split bar: "Hawks 62 | 38 Pacers", "Yes 95.5 | 4.5 No" (product rule 2).
// Only the first Outcome's Price is stored; the second side is 1 − Price. The bar is neutral for every
// Market, so the app never looks like it's rooting for a side; direction colour lives in the arrow.
import { splitChances } from "@/lib/format";

export function SplitBar({
  outcomes,
  price,
  muted = false,
}: {
  outcomes: readonly string[];
  price: number | null;
  /** Greyed while Stale/Down, or for a Finished Market's frozen split. */
  muted?: boolean;
}) {
  const [a, b] = outcomes;
  if (price === null) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm text-faint">
        <span>{a}</span>
        <span className="num">no Price yet</span>
        <span>{b}</span>
      </div>
    );
  }
  const [chanceA, chanceB] = splitChances(price);
  const width = `${Math.min(100, Math.max(0, price * 100))}%`;
  return (
    <div className={muted ? "opacity-50 grayscale" : undefined}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          <span className="text-dim">{a}</span>{" "}
          <span className="num text-base font-semibold text-ink">{chanceA}</span>
        </span>
        <span className="min-w-0 truncate text-right">
          <span className="num text-base font-semibold text-ink">{chanceB}</span>{" "}
          <span className="text-dim">{b}</span>
        </span>
      </div>
      <div
        className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-side-b"
        role="img"
        aria-label={`${a} ${chanceA}% chance, ${b} ${chanceB}% chance`}
      >
        <div className="h-full rounded-l-full bg-side-a transition-[width] duration-700" style={{ width }} />
      </div>
    </div>
  );
}
