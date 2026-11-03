import type { Tables } from "./database.types";

/** The worker_runs columns the app shows. */
export const RUN_COLUMNS =
  "id, started_at, finished_at, ok, skipped, rows_changed, catalog_refreshed, warnings, error, duration_ms" as const;

export type Run = Pick<
  Tables<"worker_runs">,
  "id" | "started_at" | "finished_at" | "ok" | "skipped" | "rows_changed" | "catalog_refreshed" | "warnings" | "error" | "duration_ms"
>;

export const RUN_LOG_SIZE = 20;

/** Newest first, no duplicates, at most `limit` Runs. */
export function mergeRuns(current: readonly Run[], incoming: readonly Run[], limit = RUN_LOG_SIZE): Run[] {
  const byId = new Map<number, Run>();
  for (const r of [...incoming, ...current]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, limit);
}
