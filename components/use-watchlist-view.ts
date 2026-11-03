"use client";
// The Watchlist's view, Cards or Heatmap (#12), remembered in localStorage like the theme.
import { useSyncExternalStore } from "react";

export type WatchlistView = "cards" | "heatmap";

const KEY = "watchlist-view";
const listeners = new Set<() => void>();
/** The choice when localStorage is unavailable. */
let fallback: WatchlistView | null = null;

function read(): WatchlistView {
  try {
    return localStorage.getItem(KEY) === "heatmap" ? "heatmap" : "cards";
  } catch {
    return "cards";
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(view: WatchlistView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
    fallback = view;
  }
  for (const notify of listeners) notify();
}

export function useWatchlistView(): [WatchlistView, (view: WatchlistView) => void] {
  // The server can't know the choice; it renders Cards, and the client switches after hydration.
  const view = useSyncExternalStore(subscribe, () => fallback ?? read(), () => "cards" as const);
  return [view, write];
}
