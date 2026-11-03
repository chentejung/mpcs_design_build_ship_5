"use client";
// The one Freshness display, used everywhere (AGENTS.md → Freshness):
// loading → skeleton · Fresh → "Live · updated 4 s ago" · Stale → amber banner · Down → red banner.
// Heartbeat: the same state at a glance, in each page's header row.
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { useReducedMotion } from "@/components/use-reduced-motion";
import { ago } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";

export function FreshnessView({
  freshness,
  now,
  live = true,
  chances = true,
}: {
  freshness: Freshness;
  now: Date;
  /** "Live · updated …" on a live page; "Feed healthy · updated …" elsewhere. */
  live?: boolean;
  /** Whether this page shows Chances that are greyed while Stale/Down. */
  chances?: boolean;
}) {
  const greyed = chances ? " Chances below are greyed." : "";
  switch (freshness.state) {
    case "loading":
      return (
        <div role="status" aria-label="Loading" className="h-6 w-48 animate-pulse rounded bg-raised motion-reduce:animate-none" />
      );

    case "fresh":
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-dim">
          <span className="live-dot inline-block size-2 rounded-full bg-live" aria-hidden />
          <span>
            {live ? "Live" : "Feed healthy"} · updated <span className="num">{ago(freshness.lastOkAt, now)}</span>
          </span>
        </p>
      );

    case "stale":
      return (
        <div role="status" className="rounded-lg border border-stale/40 bg-stale/10 px-4 py-3 text-sm">
          <p className="font-semibold text-stale">
            {freshness.reason === "disconnected" ? "Reconnecting…" : `${chances ? "Chances" : "Data"} may be out of date`}
          </p>
          <p className="mt-0.5 text-dim">
            {freshness.reason === "disconnected"
              ? `The live connection dropped; it reconnects on its own.${greyed}`
              : freshness.lastOkAt
                ? <>No successful update for <span className="num">{ago(freshness.lastOkAt, now).replace(" ago", "")}</span>.{greyed}</>
                : `No successful update yet.${greyed}`}
          </p>
        </div>
      );

    case "down":
      return (
        <div role="alert" className="rounded-lg border border-down/50 bg-down/10 px-4 py-3 text-sm">
          <p className="font-semibold text-down">
            Feed failing since <LocalTime iso={freshness.since.toISOString()} />
          </p>
          <p className="num mt-0.5 break-words text-dim">{freshness.error}</p>
          <p className="mt-1 text-dim">
            {freshness.lastOkAt ? <>Last good update {ago(freshness.lastOkAt, now)}. </> : null}
            <Link href="/status" className="text-ink underline underline-offset-2">See the run log</Link>
          </p>
        </div>
      );
  }
}

/** Chances are greyed whenever the data can't be trusted to be current. */
export function isMuted(freshness: Freshness): boolean {
  return freshness.state === "stale" || freshness.state === "down";
}

const HEARTBEAT: Record<Freshness["state"], { label: string; tone: string }> = {
  loading: { label: "Feed loading", tone: "text-faint" },
  fresh: { label: "Feed live", tone: "text-live" },
  stale: { label: "Feed stale", tone: "text-stale" },
  down: { label: "Feed down", tone: "text-down" },
};
const BLIP = "0,8 16,8 19,8 21,3 24,13 27,5 29,8 32,8 48,8";
const FLAT = "0,8 48,8";

/**
 * A tiny pulse line: it beats once for each new Run while Fresh (beat = the latest Run's id or finished_at),
 * goes flat and amber when Stale, flat and red (linking to /status) when Down, neutral while loading.
 * Under reduced motion it's a static coloured line; the state is always in its accessible name.
 */
export function Heartbeat({ freshness, beat }: { freshness: Freshness; beat: string | number | null | undefined }) {
  const reduced = useReducedMotion();
  const { label, tone } = HEARTBEAT[freshness.state];
  const fresh = freshness.state === "fresh";
  const beating = fresh && !reduced && beat != null;
  const points = fresh ? BLIP : FLAT;

  const line = (
    <svg
      role="img"
      aria-label={label}
      data-state={freshness.state}
      data-beat={beating ? String(beat) : undefined}
      viewBox="0 0 48 16"
      width={48}
      height={16}
      className={`shrink-0 ${tone}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={points} opacity={beating ? 0.3 : 1} />
      {/* A new key remounts the line, so the CSS trace replays once per Run. */}
      {beating ? <polyline key={String(beat)} points={points} pathLength={100} className="heartbeat-beat" /> : null}
    </svg>
  );

  return freshness.state === "down" ? <Link href="/status" className="inline-flex">{line}</Link> : line;
}
