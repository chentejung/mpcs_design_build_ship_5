"use client";
// Light by default, dark on request. The theme is a `dark` class on <html>, applied before first paint by
// THEME_SCRIPT (in the layout's <head>) from localStorage, so a page never flashes the other theme.
import { useSyncExternalStore } from "react";

const KEY = "theme";

/** Runs before paint: apply the saved theme. Kept tiny and dependency-free; it's inlined as a string. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  for (const notify of listeners) notify();
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this page.
  }
}

export function ThemeToggle() {
  // The server can't know the theme; it renders light, and the client corrects it after hydration.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label="Dark theme"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setDark(!dark)}
      className="grid size-8 place-items-center rounded-md text-dim hover:bg-raised hover:text-ink"
    >
      <span aria-hidden className="text-base leading-none">{dark ? "☾" : "☀"}</span>
    </button>
  );
}
