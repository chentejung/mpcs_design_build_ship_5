"use client";
import { useEffect, useState } from "react";

/**
 * The current time, ticking every second. Starts at `initial` (the server's render time) so server and
 * client render the same text; the first tick, within a second, catches up.
 */
export function useNow(initial: string): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
