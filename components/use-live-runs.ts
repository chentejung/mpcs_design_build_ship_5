"use client";
// Live worker_runs for /status. The latest Runs are refetched on every (re)subscribe; `connection` feeds
// Freshness: a channel that was live and dropped is Stale, one still connecting on first load isn't.
import { useState } from "react";
import { mergeRuns, RUN_COLUMNS, RUN_LOG_SIZE, type Run } from "@/lib/runs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import { useRealtimeChannel, type Connection } from "./use-realtime";

export function useLiveRuns(initial: Run[]): { runs: Run[]; connection: Connection } {
  const [runs, setRuns] = useState(initial);
  const db = useSupabaseBrowser();

  const connection = useRealtimeChannel(
    db,
    "worker-runs",
    (channel) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        setRuns((current) => mergeRuns(current, [payload.new as Run]));
      }),
    () => {
      void db?.from("worker_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(RUN_LOG_SIZE)
        .then(({ data }) => { if (data) setRuns((current) => mergeRuns(current, data)); });
    },
  );

  return { runs, connection };
}
