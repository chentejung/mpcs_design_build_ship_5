"use client";
// The WebGL globe itself (react-globe.gl, which brings three.js). Only ever loaded in the browser, after mount,
// through components/globe.tsx, so the server render and the build never touch WebGL. Country shapes are Natural
// Earth's 110m admin-0 countries (public domain), served statically from /geo/countries-110m.json; no map tiles.
// Everything is drawn in the neutral accent colour and the theme's panel colours (product rule 3: no green/red).
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobeProps } from "@/components/globe";
import type { PlaceGroup } from "@/lib/places";

type Country = { type: "Feature"; properties: { ISO_A2: string | null; NAME: string }; geometry: unknown };
type Theme = { accent: string; land: string; line: string; ink: string; surface: string };

const HEIGHT = 460;

/** "#4f46e5" → "rgba(79, 70, 229, a)"; anything else is returned as is. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return color;
  const n = parseInt(hex, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** A one-colour texture for the globe's surface, so its colour follows the theme without importing three.js. */
function solid(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 2, 2);
  return canvas.toDataURL();
}

function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const globe = v("--color-raised", "#eef0f6");
  return {
    accent: v("--color-accent", "#4f46e5"),
    land: v("--color-panel", "#ffffff"),
    line: v("--color-line", "#e1e4ec"),
    ink: v("--color-ink", "#12161f"),
    surface: solid(globe),
  };
}

/** The theme's colours, re-read whenever the `dark` class on <html> changes. */
function useTheme(): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function GlobeCanvas({ places, selected, onSelect, autoRotate, reducedMotion }: GlobeProps) {
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const theme = useTheme();
  const [countries, setCountries] = useState<Country[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/geo/countries-110m.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((geo: { features: Country[] }) => live && setCountries(geo.features))
      .catch((e) => console.error("globe: country shapes failed to load", e));
    return () => {
      live = false;
    };
  }, []);

  const byCode = useMemo(() => new Map(places.map((p) => [p.code, p])), [places]);
  const onGlobe = useMemo(() => places.filter((p) => p.lat !== null && p.lng !== null), [places]);
  const maxVolume = useMemo(() => Math.max(1, ...onGlobe.map((p) => p.volume24h)), [onGlobe]);

  // Gentle auto-rotation; the page turns it off under reduced motion and while a place is selected.
  useEffect(() => {
    if (!globe.current || !ready) return;
    const controls = globe.current.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number };
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.35;
  }, [ready, autoRotate]);

  // Bring the selected place round to face the viewer; instantly under reduced motion (no fly-to).
  useEffect(() => {
    const p = selected ? byCode.get(selected) : undefined;
    if (!globe.current || !ready || !p || p.lat === null || p.lng === null) return;
    globe.current.pointOfView({ lat: p.lat, lng: p.lng, altitude: 2 }, reducedMotion ? 0 : 900);
  }, [selected, byCode, ready, reducedMotion]);

  if (!theme) return <div ref={box} style={{ height: HEIGHT }} />;

  const capColor = (d: object) => {
    const code = (d as Country).properties.ISO_A2;
    if (code && code === selected) return withAlpha(theme.accent, 0.75);
    if (code && byCode.has(code)) return withAlpha(theme.accent, 0.35);
    return theme.land;
  };
  const label = (p: PlaceGroup) =>
    `<div style="padding:4px 8px;border-radius:6px;background:${theme.land};color:${theme.ink};border:1px solid ${theme.line};font:12px system-ui">${p.name} · ${p.count} Market${p.count === 1 ? "" : "s"}</div>`;

  return (
    <div ref={box} className="cursor-grab active:cursor-grabbing" data-testid="globe-canvas">
      {width > 0 ? (
        <GlobeGL
          ref={globe}
          width={width}
          height={HEIGHT}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={theme.surface || null}
          showAtmosphere
          atmosphereColor={theme.accent}
          atmosphereAltitude={0.12}
          onGlobeReady={() => setReady(true)}
          polygonsData={countries}
          polygonCapColor={capColor}
          polygonSideColor={() => withAlpha(theme.line, 0.4)}
          polygonStrokeColor={() => theme.line}
          polygonAltitude={(d: object) => ((d as Country).properties.ISO_A2 === selected ? 0.02 : 0.006)}
          polygonsTransitionDuration={reducedMotion ? 0 : 300}
          polygonLabel={(d: object) => {
            const p = byCode.get((d as Country).properties.ISO_A2 ?? "");
            return p ? label(p) : "";
          }}
          onPolygonClick={(d: object) => {
            const code = (d as Country).properties.ISO_A2;
            if (code && byCode.has(code)) onSelect(code);
          }}
          pointsData={onGlobe}
          pointLat={(d: object) => (d as PlaceGroup).lat!}
          pointLng={(d: object) => (d as PlaceGroup).lng!}
          pointColor={(d: object) => ((d as PlaceGroup).code === selected ? theme.ink : theme.accent)}
          pointAltitude={(d: object) => 0.03 + 0.3 * Math.sqrt((d as PlaceGroup).volume24h / maxVolume)}
          pointRadius={(d: object) => ((d as PlaceGroup).kind === "region" ? 1.1 : 0.7)}
          pointsMerge={false}
          pointsTransitionDuration={reducedMotion ? 0 : 500}
          pointLabel={(d: object) => label(d as PlaceGroup)}
          onPointClick={(d: object) => onSelect((d as PlaceGroup).code)}
        />
      ) : null}
    </div>
  );
}
