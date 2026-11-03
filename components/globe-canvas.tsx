"use client";
// The WebGL globe itself (react-globe.gl, which brings three.js). Only ever loaded in the browser, after mount,
// through components/globe.tsx, so the server render and the build never touch WebGL.
//
// The Earth is NASA's Blue Marble with a topology bump map, under a soft blue atmosphere, against a starfield; all
// three images are self-hosted in public/globe/ (see its README for licences). Country shapes are Natural Earth's
// 110m admin-0 countries (public domain) from /geo/countries-110m.json, drawn as nearly clear overlays on the photo;
// countries with Markets get an indigo tint. Each place has a pulsing ring sized by its 24-hour volume, the busiest
// get a label, and arcs link places that share a Market. The globe always sits in a dark "space" panel (in both
// themes), so it uses the dark theme's lighter indigo; no green or red anywhere (product rule 3). Under reduced
// motion nothing moves on its own: no auto-rotate, no rings, no dash animation, no fly-to.
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobeProps } from "@/components/globe";
import { placeInfo, type PlaceGroup, type SharedArc } from "@/lib/places";

type Country = { type: "Feature"; properties: { ISO_A2: string | null; NAME: string }; geometry: unknown };
type Arc = SharedArc & { startLat: number; startLng: number; endLat: number; endLng: number };
type OnGlobe = PlaceGroup & { lat: number; lng: number };

const HEIGHT = 460;
const LABELLED = 8;
const FLY_MS = 1200;
const ALTITUDE = 2.2;

// --color-accent and --color-accent-strong of the dark theme (app/globals.css): the panel is always dark. INDIGO
// (Tailwind indigo-500, between the two themes' accents) tints the countries, so the photo still shows through.
const INDIGO = "99, 102, 241";
const ACCENT = "129, 140, 248";
const ACCENT_STRONG = "165, 180, 252";
const rgba = (rgb: string, a: number) => `rgba(${rgb}, ${a})`;

const TEXTURES = {
  earth: "/globe/earth-blue-marble.jpg",
  bump: "/globe/earth-topology.jpg",
  sky: "/globe/night-sky.jpg",
};

// Init-only options: must be stable across renders.
const RENDERER = { antialias: true, alpha: true, powerPreference: "high-performance" } as const;

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

const plural = (n: number) => `${n} Market${n === 1 ? "" : "s"}`;

function tooltip(title: string, detail: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div style="padding:6px 10px;border-radius:8px;background:rgba(10,14,28,0.92);color:#e9edf4;border:1px solid rgba(${ACCENT},0.5);font:12px system-ui;box-shadow:0 4px 16px rgba(0,0,0,0.4)"><strong>${esc(title)}</strong><br/><span style="color:#a3adbd">${esc(detail)}</span></div>`;
}

export default function GlobeCanvas({ places, arcs, selected, onSelect, autoRotate, reducedMotion }: GlobeProps) {
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const [countries, setCountries] = useState<Country[]>([]);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const aimed = useRef(false);

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
  const onGlobe = useMemo(
    () => places.filter((p): p is OnGlobe => p.lat !== null && p.lng !== null),
    [places],
  );
  const maxVolume = useMemo(() => Math.max(1, ...onGlobe.map((p) => p.volume24h)), [onGlobe]);
  const scale = useCallback((v: number) => Math.sqrt(v / maxVolume), [maxVolume]);
  const labelled = useMemo(() => onGlobe.slice(0, LABELLED), [onGlobe]);
  const rings = useMemo(() => (reducedMotion ? [] : onGlobe), [onGlobe, reducedMotion]);

  const arcData = useMemo<Arc[]>(
    () =>
      arcs.flatMap((a) => {
        const from = placeInfo(a.from);
        const to = placeInfo(a.to);
        return from && to ? [{ ...a, startLat: from.lat, startLng: from.lng, endLat: to.lat, endLng: to.lng }] : [];
      }),
    [arcs],
  );
  const maxArc = useMemo(() => Math.max(1, ...arcData.map((a) => a.volume)), [arcData]);

  // Cap the pixel ratio: a 3x phone or a 4K screen would otherwise render 9–16 pixels per CSS pixel.
  useEffect(() => {
    if (!globe.current || !ready) return;
    globe.current.renderer().setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  }, [ready]);

  // Gentle auto-rotation; the page turns it off under reduced motion and once a place is picked.
  useEffect(() => {
    if (!globe.current || !ready) return;
    const controls = globe.current.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number };
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.35;
  }, [ready, autoRotate]);

  // Open facing the selected (at first, the busiest) place, tilted toward it; then fly to each pick (instantly
  // under reduced motion).
  useEffect(() => {
    const p = selected ? byCode.get(selected) : undefined;
    if (!globe.current || !ready || !p || p.lat === null || p.lng === null) return;
    const first = !aimed.current;
    aimed.current = true;
    globe.current.pointOfView({ lat: p.lat, lng: p.lng, altitude: ALTITUDE }, first || reducedMotion ? 0 : FLY_MS);
  }, [selected, byCode, ready, reducedMotion]);

  const codeOf = (d: object) => (d as Country).properties.ISO_A2 ?? "";
  const capColor = useCallback(
    (d: object) => {
      const code = codeOf(d);
      if (code === selected) return rgba(ACCENT, 0.42);
      if (!byCode.has(code)) return "rgba(255, 255, 255, 0)";
      return code === hovered ? rgba(ACCENT, 0.45) : rgba(INDIGO, 0.24);
    },
    [byCode, hovered, selected],
  );
  const sideColor = useCallback(
    (d: object) => (byCode.has(codeOf(d)) ? rgba(INDIGO, 0.3) : "rgba(255, 255, 255, 0)"),
    [byCode],
  );
  const strokeColor = useCallback(
    (d: object) => (byCode.has(codeOf(d)) ? rgba(ACCENT_STRONG, 0.75) : "rgba(255, 255, 255, 0.14)"),
    [byCode],
  );
  const altitude = useCallback(
    (d: object) => {
      const code = codeOf(d);
      if (code === selected) return 0.03;
      if (!byCode.has(code)) return 0.004;
      return code === hovered ? 0.018 : 0.01;
    },
    [byCode, hovered, selected],
  );
  const polygonLabel = useCallback(
    (d: object) => {
      const p = byCode.get(codeOf(d));
      return p ? tooltip(p.name, plural(p.count)) : "";
    },
    [byCode],
  );
  const onPolygonClick = useCallback(
    (d: object) => {
      const code = codeOf(d);
      if (byCode.has(code)) onSelect(code);
    },
    [byCode, onSelect],
  );
  const onPolygonHover = useCallback(
    (d: object | null) => {
      const code = d ? codeOf(d) : null;
      setHovered(code && byCode.has(code) ? code : null);
    },
    [byCode],
  );

  const ringColor = useCallback(
    (d: object) => {
      const strong = (d as OnGlobe).code === selected;
      return (t: number) => (strong ? `rgba(255, 255, 255, ${1 - t})` : rgba(ACCENT_STRONG, 0.9 * (1 - t)));
    },
    [selected],
  );
  const ringRadius = useCallback((d: object) => 2.5 + 5 * scale((d as OnGlobe).volume24h), [scale]);
  const ringPeriod = useCallback((d: object) => 1400 - 600 * scale((d as OnGlobe).volume24h), [scale]);

  const pointColor = useCallback(
    (d: object) => ((d as OnGlobe).code === selected ? "#ffffff" : rgba(ACCENT_STRONG, 0.95)),
    [selected],
  );
  const pointAltitude = useCallback((d: object) => 0.04 + 0.1 * scale((d as OnGlobe).volume24h), [scale]);
  const pointRadius = useCallback(
    (d: object) => ((d as OnGlobe).kind === "region" ? 0.55 : 0.35) * ((d as OnGlobe).code === selected ? 1.4 : 1),
    [selected],
  );
  const pointLabel = useCallback((d: object) => tooltip((d as OnGlobe).name, plural((d as OnGlobe).count)), []);
  const onPointClick = useCallback((d: object) => onSelect((d as OnGlobe).code), [onSelect]);

  const labelText = useCallback((d: object) => `${(d as OnGlobe).name} (${(d as OnGlobe).count})`, []);
  const labelColor = useCallback(
    (d: object) => ((d as OnGlobe).code === selected ? "#ffffff" : "rgba(233, 237, 244, 0.85)"),
    [selected],
  );
  const labelSize = useCallback((d: object) => 1.1 + 0.8 * scale((d as OnGlobe).volume24h), [scale]);
  const onLabelClick = onPointClick;

  const arcColor = useCallback(() => ["rgba(255, 255, 255, 0.85)", rgba(ACCENT_STRONG, 0.9)], []);
  const arcStroke = useCallback((d: object) => 0.25 + 0.9 * Math.sqrt((d as Arc).volume / maxArc), [maxArc]);
  const arcLabel = useCallback((d: object) => {
    const a = d as Arc;
    return tooltip(`${placeInfo(a.from)?.name} ↔ ${placeInfo(a.to)?.name}`, `${plural(a.count)} about both`);
  }, []);

  return (
    <div
      ref={box}
      className="relative h-[460px] cursor-grab overflow-hidden rounded-2xl bg-[#04060c] shadow-card ring-1 ring-black/10 active:cursor-grabbing dark:ring-white/10"
      data-testid="globe-canvas"
    >
      {width > 0 ? (
        <GlobeGL
          ref={globe}
          width={width}
          height={HEIGHT}
          rendererConfig={RENDERER}
          animateIn={!reducedMotion}
          backgroundColor="#04060c"
          backgroundImageUrl={TEXTURES.sky}
          globeImageUrl={TEXTURES.earth}
          bumpImageUrl={TEXTURES.bump}
          showAtmosphere
          atmosphereColor="#7cc4ff"
          atmosphereAltitude={0.2}
          onGlobeReady={() => setReady(true)}
          polygonsData={countries}
          polygonCapColor={capColor}
          polygonSideColor={sideColor}
          polygonStrokeColor={strokeColor}
          polygonAltitude={altitude}
          polygonsTransitionDuration={reducedMotion ? 0 : 300}
          polygonLabel={polygonLabel}
          onPolygonClick={onPolygonClick}
          onPolygonHover={onPolygonHover}
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor={ringColor}
          ringMaxRadius={ringRadius}
          ringPropagationSpeed={2}
          ringRepeatPeriod={ringPeriod}
          ringAltitude={0.035}
          pointsData={onGlobe}
          pointLat="lat"
          pointLng="lng"
          pointColor={pointColor}
          pointAltitude={pointAltitude}
          pointRadius={pointRadius}
          pointsMerge={false}
          pointsTransitionDuration={reducedMotion ? 0 : 500}
          pointLabel={pointLabel}
          onPointClick={onPointClick}
          labelsData={labelled}
          labelLat="lat"
          labelLng="lng"
          labelText={labelText}
          labelColor={labelColor}
          labelSize={labelSize}
          labelDotRadius={0.3}
          labelAltitude={0.04}
          labelResolution={2}
          labelsTransitionDuration={reducedMotion ? 0 : 500}
          onLabelClick={onLabelClick}
          arcsData={arcData}
          arcColor={arcColor}
          arcStroke={arcStroke}
          arcStartAltitude={0.012}
          arcEndAltitude={0.012}
          arcAltitudeAutoScale={0.25}
          arcDashLength={0.45}
          arcDashGap={0.2}
          arcDashAnimateTime={reducedMotion ? 0 : 2600}
          arcsTransitionDuration={reducedMotion ? 0 : 600}
          arcLabel={arcLabel}
        />
      ) : null}
    </div>
  );
}
