"use client";
// "Alert hit" toasts: shown the moment a pushed markets UPDATE crosses one of the viewer's Alerts (lib/watchlist.ts
// → crossedAlerts), before the next snapshot refetch confirms the trigger. The polite live region is always
// present, so screen readers announce each new toast (role="status" is left to the Freshness line). Each hides on its own after a few seconds or on Dismiss; it
// slides in, except under prefers-reduced-motion. The accent is neutral (never green/red, product rule 3).
import { useEffect } from "react";
import { useReducedMotion } from "@/components/use-reduced-motion";

export const TOAST_MS = 6_000;

export type Toast = { id: number; text: string };

export function AlertToasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss(id: number): void }) {
  const reduced = useReducedMotion();
  return (
    <section
      aria-live="polite"
      aria-label="Alert notifications"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} reduced={reduced} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

function ToastItem({ toast, reduced, onDismiss }: { toast: Toast; reduced: boolean; onDismiss(id: number): void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]); // onDismiss is stable, so this is one timer per toast, from when it appears.
  return (
    <div
      data-motion={reduced ? "off" : "on"}
      className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-accent bg-panel px-4 py-2.5 text-sm shadow-card ${reduced ? "" : "toast-in"}`}
    >
      <p className="min-w-0 flex-1">{toast.text}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md px-2 py-0.5 text-xs text-dim hover:bg-raised hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}
