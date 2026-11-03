// The one Freshness display, used everywhere (AGENTS.md → Freshness):
// loading → skeleton · Fresh → "Live · updated 4 s ago" · Stale → amber banner · Down → red banner.
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
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
