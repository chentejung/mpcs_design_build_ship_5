"use client";
// The globe on the landing page and Explore, loaded only in the browser (next/dynamic, ssr: false), so three.js stays out of the
// server render, the build's server bundle and the page's first-load JavaScript. If WebGL fails to start, the
// error boundary hands back to the page, which keeps the plain list of places.
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { PlaceGroup, SharedArc } from "@/lib/places";

export type GlobeProps = {
  /** Countries and regions with Markets (Global isn't on the globe). */
  places: readonly PlaceGroup[];
  /** Pairs of places that share Markets, busiest first (`sharedArcs`). */
  arcs: readonly SharedArc[];
  selected: string | null;
  onSelect: (code: string) => void;
  autoRotate: boolean;
  /** No fly-to or transitions. */
  reducedMotion: boolean;
};

const GlobeCanvas = dynamic(() => import("@/components/globe-canvas"), {
  ssr: false,
  loading: () => <GlobePlaceholder />,
});

function GlobePlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading the globe"
      className="flex h-[460px] items-center justify-center overflow-hidden rounded-2xl bg-[#04060c]"
    >
      <div className="aspect-square h-[70%] animate-pulse rounded-full bg-[#1b2a4a] motion-reduce:animate-none" />
    </div>
  );
}

const WIDE = "(min-width: 768px)";
let webgl: boolean | undefined;

function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webgl = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** Whether to try the globe at all: a wide enough screen and a browser that can make a WebGL context. */
export function supportsGlobe(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(WIDE).matches && hasWebGL();
}

/** Re-checks supportsGlobe when the screen crosses the width. */
export function subscribeGlobeSupport(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

class GlobeBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("globe: failed to start, showing the list of places only", error);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Globe({ onFail, ...props }: GlobeProps & { onFail: () => void }) {
  return (
    <GlobeBoundary onFail={onFail}>
      <GlobeCanvas {...props} />
    </GlobeBoundary>
  );
}
