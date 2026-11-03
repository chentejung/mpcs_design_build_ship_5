"use client";
import { FreshnessView } from "@/components/freshness";
import { LocalTime } from "@/components/local-time";
import { useLiveRuns } from "@/components/use-live-runs";
import { useNow } from "@/components/use-now";
import { ago } from "@/lib/format";
import { freshness } from "@/lib/freshness";
import type { Run } from "@/lib/runs";

export function StatusLive({ initial, renderedAt }: { initial: Run[]; renderedAt: string }) {
  const { runs, connection } = useLiveRuns(initial);
  const now = useNow(renderedAt);
  const f = freshness(runs, now, connection !== "lost");

  return (
    <>
      <div className="mt-4">
        <FreshnessView freshness={f} now={now} live={false} chances={false} />
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">The worker&rsquo;s last {runs.length} Runs, newest first</caption>
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Time</th>
              <th scope="col" className="px-4 py-2 font-medium">Result</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Rows changed</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Duration</th>
              <th scope="col" className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="num whitespace-nowrap px-4 py-2 text-dim">
                  <LocalTime iso={r.started_at} precision="seconds" />
                  <span className="ml-2 text-xs text-faint">{ago(new Date(r.finished_at), now)}</span>
                </td>
                <td className="px-4 py-2">
                  <RunResult run={r} />
                </td>
                <td className="num px-4 py-2 text-right">{r.skipped ? "—" : r.rows_changed}</td>
                <td className="num px-4 py-2 text-right text-dim">{r.duration_ms === null ? "—" : `${r.duration_ms} ms`}</td>
                <td className="px-4 py-2 text-xs text-dim">
                  {r.catalog_refreshed ? <span className="mr-2 rounded bg-raised px-1.5 py-0.5">Catalog refreshed</span> : null}
                  {r.warnings.map((w) => <p key={w} className="text-stale">⚠ {w}</p>)}
                  {r.error ? <p className="num break-words text-down">{r.error}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 ? <p className="px-4 py-6 text-center text-dim">No Runs yet.</p> : null}
      </div>
    </>
  );
}

function RunResult({ run }: { run: Run }) {
  if (run.skipped) return <span className="text-faint">skipped</span>;
  if (run.ok) return <span className="text-live">ok</span>;
  return <span className="font-semibold text-down">failed</span>;
}
