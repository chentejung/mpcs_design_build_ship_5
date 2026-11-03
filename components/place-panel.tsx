"use client";
// Markets by place on the signed-out landing page (issue #15), without the globe: the plain list of places
// (always shown, and the whole UI on small screens, without WebGL, or for screen readers and keyboards), the
// selected place's Markets as Browse cards with Follow, and the Global shelf of Markets with no place.
// Follow here is Browse's: signed out it opens sign-in and returns to /browse?category=…&follow=<id> (rule 7).
import { useState } from "react";
import { BrowseCard } from "@/components/browse-card";
import { volume } from "@/lib/format";
import type { PlaceGroup } from "@/lib/places";

const SHOWN = 6;

const plural = (n: number) => `${n} Market${n === 1 ? "" : "s"}`;

export function PlaceList({
  places,
  selected,
  onSelect,
}: {
  places: readonly PlaceGroup[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  if (places.length === 0) return null;
  return (
    <nav aria-label="Places">
      <ul className="flex flex-wrap gap-1.5">
        {places.map((p) => (
          <li key={p.code}>
            <button
              type="button"
              aria-pressed={p.code === selected}
              aria-label={`${p.name}, ${plural(p.count)}`}
              onClick={() => onSelect(p.code)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                p.code === selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-dim hover:border-accent hover:text-ink"
              }`}
            >
              {p.name} <span className="num opacity-75">{p.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MarketCards({ group, now, wide = false }: { group: PlaceGroup; now: Date; wide?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? group.markets : group.markets.slice(0, SHOWN);
  return (
    <>
      <ul className={`grid gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : ""}`}>
        {shown.map((m) => (
          <BrowseCard
            key={m.id}
            // No Event heading here, so name each Market by its full question, not its group item ("Democrats").
            market={{ ...m, group_item_title: null }}
            now={now}
            muted={false}
            followed={false}
            signedIn={false}
            returnTo={`/browse?category=${m.category}`}
          />
        ))}
      </ul>
      {group.count > SHOWN ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="mt-3 text-sm font-medium text-accent hover:text-accent-strong"
        >
          {all ? "Show fewer" : `Show all ${group.count}`}
        </button>
      ) : null}
    </>
  );
}

export function PlacePanel({ place, now }: { place: PlaceGroup | null; now: Date }) {
  if (!place) {
    return (
      <p className="rounded-xl border border-line bg-panel p-5 text-sm text-dim shadow-card">
        Pick a place on the globe or from the list to see its Markets.
      </p>
    );
  }
  return (
    <section aria-labelledby="place-heading">
      <div className="mb-3">
        <h3 id="place-heading" className="text-lg font-semibold tracking-tight">
          {place.name}
        </h3>
        <p className="text-xs text-faint">
          {plural(place.count)} · <span className="num">{volume(place.volume24h)}</span> 24h
        </p>
      </div>
      {/* Re-mounts per place, so "Show all" starts collapsed for each. */}
      <MarketCards key={place.code} group={place} now={now} />
    </section>
  );
}

export function GlobalShelf({ global, now }: { global: PlaceGroup; now: Date }) {
  return (
    <section aria-labelledby="global-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="global-heading" className="text-base font-semibold tracking-tight">
          Global
        </h2>
        <p className="text-xs text-faint">Markets about no one place · {plural(global.count)}</p>
      </div>
      {global.count === 0 ? (
        <p className="rounded-xl border border-line bg-panel px-4 py-6 text-center text-sm text-dim shadow-card">
          Every Market right now has a place on the globe.
        </p>
      ) : (
        <MarketCards group={global} now={now} wide />
      )}
    </section>
  );
}
