"use client";

import { useEffect, useState } from "react";

/** Wall-clock "now" that re-renders every `intervalMs` (keeps render pure for the React Compiler). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
