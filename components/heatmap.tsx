"use client";
// The Watchlist as a Heatmap (#12): one tile per live Market, sized by 24-hour volume and shaded by Δ 1h
// (lib/heatmap.ts). Green/red only on Yes/No Markets, a neutral accent shade otherwise (product rule 3).
// Finished Markets are left out. Tiles read the same items as the cards, so they update from the same
// Realtime UPDATEs. Activating a tile opens that Market's card in a panel under the map; the map stays put.
import { useState } from "react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import type { WatchlistView } from "@/components/use-watchlist-view";
import { WatchCard } from "@/components/watch-card";
import { splitChances } from "@/lib/format";
import { heatIntensity, heatSize, heatTone, type HeatSize, type HeatTone } from "@/lib/heatmap";
import { delta, formatDelta, HOUR_MS } from "@/lib/history";
import { marketLabel } from "@/lib/markets";
import type { Followed } from "@/lib/watchlist";

/** The Cards / Heatmap switch: two pressed-state buttons, reachable with Tab. */
export function ViewToggle({ view, onChange }: { view: WatchlistView; onChange: (view: WatchlistView) => void }) {
  const option = (value: WatchlistView, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => onChange(value)}
      className={`rounded px-2.5 py-1 text-xs font-medium ${
        view === value ? "bg-panel text-ink shadow-card" : "text-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Watchlist view" className="inline-flex rounded-md border border-line bg-raised p-0.5">
      {option("cards", "Cards")}
      {option("heatmap", "Heatmap")}
    </div>
  );
}

const SPAN: Record<HeatSize, string> = {
  sm: "",
  md: "col-span-2",
  lg: "col-span-2 row-span-2",
};

const SHADE: Record<HeatTone, string | null> = {
  up: "var(--color-up)",
  down: "var(--color-down)",
  neutral: "var(--color-accent)",
  flat: null,
};

export function Heatmap({ live, now, muted }: { live: readonly Followed[]; now: Date; muted: boolean }) {
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = live.find((m) => m.id === selectedId) ?? null;
  const maxVolume = Math.max(0, ...live.map((m) => m.volume_24h ?? 0));

  return (
    <div className="mt-6">
      <ul aria-label="Heatmap" className="grid grid-flow-row-dense auto-rows-[5.5rem] grid-cols-4 gap-2 sm:grid-cols-6">
        {live.map((m) => {
          const label = marketLabel(m);
          const d = delta(m.history ?? [], m.price, now, HOUR_MS);
          const tone = heatTone(m.outcomes, d);
          const size = heatSize(m.volume_24h, maxVolume);
          const shade = SHADE[tone];
          const chance = m.price === null ? "—" : `${splitChances(m.price)[0]}%`;
          const name = `${label}: ${m.outcomes[0]} ${chance}, Δ 1h ${formatDelta(d)}`;
          const open = m.id === selectedId;
          return (
            <li key={m.id} className={SPAN[size]}>
              <button
                type="button"
                aria-label={name}
                aria-expanded={open}
                aria-controls={open ? `heat-details-${m.id}` : undefined}
                title={m.question}
                data-tone={tone}
                data-size={size}
                data-motion={reduced ? "off" : "on"}
                onClick={() => setSelectedId(open ? null : m.id)}
                style={shade ? {
                  backgroundColor: `color-mix(in srgb, ${shade} ${Math.round(12 + heatIntensity(d) * 38)}%, var(--color-panel))`,
                } : undefined}
                className={`flex size-full flex-col justify-between overflow-hidden rounded-lg border p-2 text-left ${
                  open ? "border-accent" : "border-line"
                } ${shade ? "" : "bg-panel"} ${muted ? "opacity-50 grayscale" : ""} ${
                  reduced ? "" : "transition-colors duration-500"
                } hover:border-accent`}
              >
                <span className={`font-medium leading-snug text-ink ${size === "lg" ? "line-clamp-3 text-sm" : "line-clamp-2 text-xs"}`}>
                  {label}
                </span>
                <span className={`num text-ink ${size === "lg" ? "text-lg" : "text-sm"}`}>
                  {m.outcomes[0]} {chance}
                  <span className="ml-1.5 text-xs text-dim">{formatDelta(d)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <section
          id={`heat-details-${selected.id}`}
          aria-label={`${marketLabel(selected)} details`}
          className="mt-4"
        >
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-md border border-line px-3 py-1 text-xs text-dim hover:text-ink"
            >
              Close details
            </button>
          </div>
          <ul>
            <WatchCard market={selected} now={now} muted={muted} />
          </ul>
        </section>
      ) : null}
    </div>
  );
}
