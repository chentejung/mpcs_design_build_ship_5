"use client";
// One Realtime channel that stays up (AGENTS.md → Realtime). If the channel errors, times out or is closed by
// the server (for instance "Token has expired"), it is dropped and rejoined with backoff; every (re)subscribe
// calls onSubscribed, so the page refetches its snapshot (Realtime doesn't replay what was missed).
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import type { Database } from "@/lib/database.types";

export type Connection = "connecting" | "live" | "lost";

const MAX_BACKOFF_MS = 15_000;

export function useRealtimeChannel(
  db: SupabaseClient<Database> | null,
  /** A new name (e.g. a new set of Market ids) starts a new channel. */
  name: string,
  attach: (channel: RealtimeChannel) => RealtimeChannel,
  onSubscribed: () => void,
): Connection {
  const [connection, setConnection] = useState<Connection>("connecting");
  // The latest callbacks, without re-subscribing when they change identity.
  const attachRef = useRef(attach);
  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    attachRef.current = attach;
    onSubscribedRef.current = onSubscribed;
  });

  useEffect(() => {
    if (!db) return;
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;

    const join = async () => {
      // Rejoin with a fresh token: the one Realtime holds may have expired while we were away.
      await db.realtime.setAuth().catch(() => {});
      if (stopped) return;
      const current = attachRef.current(db.channel(name));
      channel = current;
      current.subscribe((status, err) => {
        if (stopped || channel !== current) return;
        if (status === "SUBSCRIBED") {
          backoff = 1000;
          setConnection("live");
          onSubscribedRef.current();
          return;
        }
        console.warn(`Realtime ${status}`, err?.message ?? "");
        setConnection("lost");
        channel = null;
        void db.removeChannel(current);
        retry = setTimeout(() => void join(), backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      });
    };
    void join();

    return () => {
      stopped = true;
      clearTimeout(retry);
      if (channel) void db.removeChannel(channel);
    };
  }, [db, name]);

  return connection;
}
