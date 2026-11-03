"use client";
// Whether the viewer asked the OS for reduced motion (product rule 3): then values change instantly.
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  // The server can't know; it assumes motion is fine, and nothing animates until a value changes anyway.
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
