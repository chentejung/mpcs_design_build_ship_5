"use client";
// A clock time in the visitor's own time zone. The server (UTC on Vercel) can't know it, so the time is
// rendered only in the browser; until then an invisible placeholder keeps the layout still.
import { useSyncExternalStore } from "react";

const FORMATS = {
  minutes: { hour: "numeric", minute: "2-digit" },
  seconds: { hour: "numeric", minute: "2-digit", second: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const noSubscription = () => () => {};

export function LocalTime({ iso, precision = "minutes" }: { iso: string; precision?: keyof typeof FORMATS }) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={inBrowser ? date.toLocaleString() : undefined}>
      {inBrowser ? date.toLocaleTimeString([], FORMATS[precision]) : <span className="invisible">0:00:00 PM</span>}
    </time>
  );
}
