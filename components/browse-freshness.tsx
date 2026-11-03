"use client";
// Browse is static (product rule 6): Prices as of page load. This line says how old they are, ticking,
// and Refresh reloads the page's data. The Stale/Down banner is the system's state when the page loaded.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FreshnessView } from "@/components/freshness";
import { ago } from "@/lib/format";
import { freshness, type RunSummary } from "@/lib/freshness";
import { useNow } from "./use-now";

export function BrowseFreshness({ runs, loadedAt }: { runs: RunSummary[]; loadedAt: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const now = useNow(loadedAt);
  const atLoad = freshness(runs, new Date(loadedAt), true);
  const pricesAsOf = atLoad.state === "fresh" ? atLoad.lastOkAt : new Date(loadedAt);

  return (
    <div className="space-y-3">
      {atLoad.state === "stale" || atLoad.state === "down" ? <FreshnessView freshness={atLoad} now={now} /> : null}
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-dim">
        <span>
          Prices as of <span className="num">{ago(pricesAsOf, now)}</span>
        </span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={refreshing}
          className="text-ink underline underline-offset-2 disabled:text-faint disabled:no-underline"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <span aria-hidden>·</span>
        <span className="text-faint">Follow a Market to watch it live.</span>
      </p>
    </div>
  );
}
