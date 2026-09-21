"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "@/lib/ui/api";

export interface ApiState<T> {
  data: T | null;
  error: ApiClientError | Error | null;
  loading: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Minimal GET hook: fetches `url` (null = skip), aborts on change/unmount, exposes reload + local mutation.
 * Optional `initial` data (from a server component) avoids a loading flash / layout shift on first paint.
 * Keeps the previous data while reloading so views don't flash skeletons on refresh.
 */
export function useApi<T>(url: string | null, initial: T | null = null): ApiState<T> {
  // `initial` (server-rendered) paints immediately; the client still revalidates against the API.
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag mirrors the in-flight request
    setLoading(true);
    setError(null);
    api<T>(url, { signal: ctrl.signal, cache: "no-store" })
      .then((d) => {
        if (!ctrl.signal.aborted) setData(d);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e : new Error("Request failed"));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}

/** Human message for an API failure; 501 = the backend for this feature hasn't landed yet. */
export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.status === 501) return "This feature isn't available on the server yet.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
