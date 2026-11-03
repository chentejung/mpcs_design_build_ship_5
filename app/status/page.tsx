import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RUN_COLUMNS, RUN_LOG_SIZE } from "@/lib/runs";
import { supabase } from "@/lib/supabase";
import { StatusLive } from "./status-live";

export const metadata: Metadata = { title: "Status" };

// /status: the worker's last 20 Runs, live. Open to everyone (anon can read worker_runs).
export default function StatusPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Feed status</h1>
      <p className="mt-1 text-sm text-dim">
        A Run fetches every Price from Polymarket every 10 seconds and saves only what changed. The Catalog of Markets is
        refreshed about every 5 minutes.
      </p>
      <Suspense fallback={<div role="status" aria-label="Loading Runs" className="mt-6 h-96 animate-pulse rounded-lg border border-line bg-panel motion-reduce:animate-none" />}>
        <RunLog />
      </Suspense>
    </>
  );
}

async function RunLog() {
  await connection();
  const { data, error } = await supabase().from("worker_runs").select(RUN_COLUMNS)
    .order("started_at", { ascending: false }).limit(RUN_LOG_SIZE);
  if (error) throw new Error(`Couldn't load the run log: ${error.message}`);
  return <StatusLive initial={data} renderedAt={new Date().toISOString()} />;
}
