"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR + hydration, true afterwards. Use for timezone/locale-dependent output. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
