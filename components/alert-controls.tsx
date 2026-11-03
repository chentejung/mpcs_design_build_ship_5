"use client";
// A card's Alerts (CONTEXT.md → Alert): its active ones, each with Delete, and a small form to add one
// ("Yes above 60%", "Hawks below 40%": always the first Outcome). An Alert the Price is already past would
// fire on the next Price change, so the form warns and asks before setting it. Triggered Alerts are listed
// under Triggered on the Watchlist instead.
import { useId, useState, useTransition } from "react";
import { createAlert, deleteAlert } from "@/app/actions/alerts";
import { alertPhrase, isPast, parseChance, thresholdChance, type Alert, type Direction } from "@/lib/alerts";
import { splitChances } from "@/lib/format";

export function AlertControls({
  marketId,
  label,
  outcomes,
  price,
  closed,
  alerts,
  onAdded,
  onDeleted,
}: {
  marketId: string;
  label: string;
  outcomes: readonly string[];
  price: number | null;
  closed: boolean;
  /** This Market's Alerts that haven't triggered. */
  alerts: readonly Alert[];
  onAdded(alert: Alert): void;
  onDeleted(id: number): void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("above");
  const [chance, setChance] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (threshold: number) =>
    startTransition(async () => {
      const result = await createAlert({ marketId, direction, chance: Math.round(threshold * 1000) / 10 });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onAdded(result.alert);
      setOpen(false);
      setChance("");
      setWarning(null);
      setMessage(null);
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const threshold = parseChance(chance);
    if (threshold === null) {
      setMessage("Enter a Chance from 1 to 99 %.");
      return;
    }
    if (isPast(direction, threshold, price) && price !== null) {
      setWarning(
        `${outcomes[0]} is already ${direction} ${thresholdChance(threshold)}% (now ${splitChances(price)[0]}%), ` +
          "so this alert would fire on the next Price change.",
      );
      return;
    }
    save(threshold);
  };

  const remove = (alert: Alert) =>
    startTransition(async () => {
      const result = await deleteAlert(alert.id);
      if (result.ok) onDeleted(alert.id);
      else setMessage(result.message);
    });

  if (closed && alerts.length === 0) return null;

  return (
    <div className="mt-2 text-xs">
      {alerts.length > 0 ? (
        <ul aria-label={`Alerts on ${label}`} className="flex flex-wrap gap-1.5">
          {alerts.map((a) => {
            const phrase = alertPhrase(outcomes, a);
            return (
              <li key={a.id} className="flex items-center gap-1 rounded-full border border-dashed border-accent px-2 py-0.5 text-dim">
                <span>{phrase}</span>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={pending}
                  aria-label={`Delete alert ${phrase} on ${label}`}
                  className="text-faint hover:text-ink disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {closed ? null : open ? (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-dim">{outcomes[0]}</span>
          <label htmlFor={`${ids}-dir`} className="sr-only">Direction</label>
          <select
            id={`${ids}-dir`}
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as Direction);
              setWarning(null);
            }}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <label htmlFor={`${ids}-chance`} className="sr-only">Chance (%)</label>
          <input
            id={`${ids}-chance`}
            type="number"
            inputMode="decimal"
            min={1}
            max={99}
            step={0.1}
            required
            value={chance}
            onChange={(e) => {
              setChance(e.target.value);
              setWarning(null);
            }}
            className="num w-16 rounded-md border border-line bg-panel px-1.5 py-1"
          />
          <span className="text-dim">%</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
          >
            Set alert
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setWarning(null);
              setMessage(null);
            }}
            className="rounded-md px-2 py-1 text-faint hover:text-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Add alert on ${label}`}
          className="mt-2 rounded-md px-2 py-1 text-faint hover:bg-raised hover:text-ink"
        >
          + Alert
        </button>
      )}

      {warning ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-stale">
          <span>{warning}</span>
          <button
            type="button"
            onClick={() => {
              const threshold = parseChance(chance);
              if (threshold !== null) save(threshold);
            }}
            disabled={pending}
            className="rounded-md border border-line px-2 py-0.5 text-ink hover:bg-raised disabled:opacity-50"
          >
            Set anyway
          </button>
        </div>
      ) : null}
      {message ? <p role="alert" className="mt-1 text-stale">{message}</p> : null}
    </div>
  );
}
