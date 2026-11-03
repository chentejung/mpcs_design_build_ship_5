"use client";
// The signed-out landing page's centrepiece (issue #15): a globe of Markets by place, the plain list of places,
// the selected place's Markets, and the Global shelf. Static like Browse: Prices as of page load. The globe is
// only tried on wide screens with WebGL; the list and panel work without it. It turns gently until the visitor
// picks a place, and never under reduced motion (product rule 3).
import { useMemo, useState, useSyncExternalStore } from "react";
import { Globe, subscribeGlobeSupport, supportsGlobe } from "@/components/globe";
import { GlobalShelf, PlaceList, PlacePanel } from "@/components/place-panel";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { groupByPlace, type PlacedMarket } from "@/lib/places";

export function PlaceExplorer({ markets, renderedAt }: { markets: readonly PlacedMarket[]; renderedAt: string }) {
  const { places, global } = useMemo(() => groupByPlace(markets), [markets]);
  const now = useMemo(() => new Date(renderedAt), [renderedAt]);
  const reduced = useReducedMotion();
  const canGlobe = useSyncExternalStore(subscribeGlobeSupport, supportsGlobe, () => false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // Until the visitor picks one, the panel shows the busiest place.
  const selected = picked ?? places[0]?.code ?? null;
  const place = places.find((p) => p.code === selected) ?? null;
  const showGlobe = canGlobe && !failed && places.length > 0;

  return (
    <div className="space-y-10">
      <section aria-labelledby="places-heading">
        <div className="mb-4">
          <h2 id="places-heading" className="text-base font-semibold tracking-tight">
            Markets around the world
          </h2>
          <p className="mt-1 text-sm text-dim">
            {places.length === 0
              ? "No Market has a place yet, so they are all on the Global shelf below."
              : showGlobe
                ? "Drag to spin, scroll to zoom, and pick a marker or a country to see its Markets."
                : "Pick a place to see its Markets."}
          </p>
        </div>
        {places.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {showGlobe ? (
                <Globe
                  places={places}
                  selected={selected}
                  onSelect={setPicked}
                  autoRotate={!reduced && picked === null}
                  reducedMotion={reduced}
                  onFail={() => setFailed(true)}
                />
              ) : null}
              <PlaceList places={places} selected={selected} onSelect={setPicked} />
            </div>
            <PlacePanel place={place} now={now} />
          </div>
        ) : null}
      </section>
      <GlobalShelf global={global} now={now} />
    </div>
  );
}
