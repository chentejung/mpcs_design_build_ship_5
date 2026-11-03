"use client";
// The "Since your last visit" Recap at the top of the Watchlist (CONTEXT.md → Recap). The server computes it once
// per page load (lib/recap.ts) and hands it to RecapScope, which sits outside the Watchlist's keyed live view, so
// following, unfollowing or a refresh (which re-renders the page against the visit just recorded) doesn't replace
// it. RecapScope then records this visit, once. Direction is green/red only on Yes/No Markets (product rule 3);
// Replay moves each bar from its split at the last visit to now, and under reduced motion it does nothing.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { recordVisit } from "@/app/actions/visits";
import { LocalTime } from "@/components/local-time";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { isYesNo, splitChances } from "@/lib/format";
import { DAY_MS } from "@/lib/history";
import type { Recap, RecapEntry } from "@/lib/recap";

type Scope = { recap: Recap; dismissed: boolean; dismiss: () => void };

const RecapContext = createContext<Scope | null>(null);

export function RecapScope({ recap, children }: { recap: Recap; children: ReactNode }) {
  const [first] = useState(recap);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    void recordVisit();
  }, []);
  return (
    <RecapContext.Provider value={{ recap: first, dismissed, dismiss: () => setDismissed(true) }}>
      {children}
    </RecapContext.Provider>
  );
}

const REPLAY_MS = 1200;

type Phase = "idle" | "rewound" | "playing";

export function RecapPanel({ now }: { now: Date }) {
  const scope = useContext(RecapContext);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (phase === "rewound") {
      // Paint the old split first, then let the bars glide to now.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setPhase("playing"));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (phase === "playing") {
      const t = setTimeout(() => setPhase("idle"), REPLAY_MS + 100);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (!scope || scope.dismissed || scope.recap.kind === "none") return null;
  const r = scope.recap;
  const since = new Date(r.since);
  const time = <LocalTime iso={r.since} precision={now.getTime() - since.getTime() < DAY_MS ? "minutes" : "date"} />;
  const replaying = phase !== "idle";

  return (
    <section
      aria-labelledby="recap-heading"
      data-replay={replaying ? phase : undefined}
      className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="recap-heading" className="text-sm font-semibold">
            {r.kind === "quiet" ? <>Nothing big moved since {time}</> : <>Since your last visit · {time}</>}
          </h2>
          {r.capped ? (
            <p className="mt-0.5 text-xs text-faint">Covers only the last 7 days; older Prices aren&rsquo;t kept.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {r.kind === "moved" ? (
            <button
              type="button"
              onClick={() => (reduced ? undefined : setPhase("rewound"))}
              aria-label="Replay the moves"
              className="rounded-md border border-line px-2.5 py-1 text-xs text-dim hover:text-ink"
            >
              ↺ Replay
            </button>
          ) : null}
          <button
            type="button"
            onClick={scope.dismiss}
            aria-label="Dismiss the recap"
            className="rounded-md px-2 py-1 text-xs text-faint hover:bg-raised hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>

      {r.kind === "moved" ? (
        <ul className="mt-3 grid gap-2">
          {r.entries.map((e) => <RecapLine key={e.id} entry={e} at={phase === "rewound" ? "from" : "to"} />)}
          {r.finished.map((e) => <RecapLine key={e.id} entry={e} at={phase === "rewound" ? "from" : "to"} finished />)}
        </ul>
      ) : null}
    </section>
  );
}

function RecapLine({ entry, at, finished = false }: { entry: RecapEntry; at: "from" | "to"; finished?: boolean }) {
  const first = entry.outcomes[0];
  const yesNo = isYesNo(entry.outcomes);
  const shown = at === "from" && entry.from !== null ? entry.from : entry.to;
  const width = `${Math.min(100, Math.max(0, shown * 100))}%`;
  const points = entry.points === null ? null : Math.abs(entry.points);
  const tone = !entry.dir ? "neutral" : yesNo ? entry.dir : "neutral";
  const colour = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-dim";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-medium">{entry.label}</span>
        {finished ? <span className="shrink-0 text-xs text-faint">Finished</span> : null}
      </span>
      <span className="num flex items-baseline gap-1.5 text-dim">
        <span>
          {first} {entry.from !== null ? `${splitChances(entry.from)[0]} → ` : ""}
          <span className="font-semibold text-ink">{splitChances(entry.to)[0]}</span>
        </span>
        {entry.dir && points !== null ? (
          <span role="img" aria-label={`${entry.dir === "up" ? "Up" : "Down"} ${points} points`} data-tone={tone} className={colour}>
            {entry.dir === "up" ? "▲" : "▼"}
          </span>
        ) : null}
      </span>
      <div className="col-span-2 flex h-1.5 overflow-hidden rounded-full bg-side-b" aria-hidden data-recap-bar={entry.id} data-at={at}>
        <div
          className={`h-full rounded-l-full bg-side-a ${at === "from" ? "transition-none" : "transition-[width] ease-out motion-reduce:transition-none"}`}
          style={{ width, transitionDuration: at === "from" ? undefined : `${REPLAY_MS}ms` }}
        />
      </div>
    </li>
  );
}
