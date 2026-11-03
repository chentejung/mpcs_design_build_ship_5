"use client";
// The Watchlist's Triggered list: every Alert the worker has marked as hit, latest first, with the Chance it
// hit at and when, so an Alert that fired while you were away isn't missed. Each can be deleted.
import { useId, useState, useTransition } from "react";
import { deleteAlert } from "@/app/actions/alerts";
import { alertPhrase, type Alert } from "@/lib/alerts";
import { ago, splitChances } from "@/lib/format";
import { marketLabel } from "@/lib/markets";
import type { Followed } from "@/lib/watchlist";

export function TriggeredAlerts({
  alerts,
  items,
  now,
  onDeleted,
}: {
  alerts: readonly Alert[];
  items: readonly Followed[];
  now: Date;
  onDeleted(id: number): void;
}) {
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const byId = new Map(items.map((m) => [m.id, m]));
  const hits = alerts
    .filter((a) => a.triggered_at !== null && byId.has(a.market_id))
    .sort((a, b) => b.triggered_at!.localeCompare(a.triggered_at!));
  if (hits.length === 0) return null;

  const remove = (id: number) =>
    startTransition(async () => {
      const result = await deleteAlert(id);
      if (result.ok) onDeleted(id);
      else setMessage(result.message);
    });

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-sm font-semibold text-dim">Triggered</h2>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-panel">
        {hits.map((a) => {
          const m = byId.get(a.market_id)!;
          const label = marketLabel(m);
          const phrase = alertPhrase(m.outcomes, a);
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium" title={m.question}>{label}</p>
                <p className="text-xs text-faint">
                  <span>{phrase}</span>
                  {" · "}
                  <span className="num">
                    hit at {a.triggered_price === null ? "—" : `${splitChances(a.triggered_price)[0]}%`}
                    {" "}{ago(new Date(a.triggered_at!), now)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={pending}
                aria-label={`Delete alert ${phrase} on ${label}`}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-faint hover:bg-raised hover:text-ink disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      {message ? <p role="alert" className="mt-1 text-xs text-stale">{message}</p> : null}
    </section>
  );
}
