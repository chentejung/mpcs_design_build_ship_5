"use client";
// Live worker_runs over Supabase Realtime (AGENTS.md → Realtime). Realtime doesn't replay what was missed
// while disconnected, so every (re)subscribe refetches the latest Runs. `connection` feeds Freshness: a
// channel that was live and dropped is Stale; one still connecting on first load isn't.
import { useEffect, useState } from "react";
import { mergeRuns, RUN_COLUMNS, RUN_LOG_SIZE, type Run } from "@/lib/runs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";

export type Connection = "connecting" | "live" | "lost";

export function useLiveRuns(initial: Run[]): { runs: Run[]; connection: Connection } {
  const [runs, setRuns] = useState(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const db = useSupabaseBrowser();

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    const refetch = async () => {
      const { data } = await db.from("worker_runs").select(RUN_COLUMNS)
        .order("started_at", { ascending: false }).limit(RUN_LOG_SIZE);
      if (!cancelled && data) setRuns((current) => mergeRuns(current, data));
    };

    const channel = db
      .channel("worker-runs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "worker_runs" }, (payload) => {
        setRuns((current) => mergeRuns(current, [payload.new as Run]));
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refetch();
        } else {
          setConnection("lost");
        }
      });

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [db]);

  return { runs, connection };
}
