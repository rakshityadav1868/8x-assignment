"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "./api";

/**
 * Tiny client data hook: GET `url` (null = skip), expose loading / error / data + reload + local setData.
 * Re-fetches whenever one of `tags` is invalidated via `invalidate(tag)` (cross-component refresh,
 * e.g. the sidebar folder counts after a bulk move on the library page).
 */
export function useApi<T>(url: string | null, opts?: { tags?: string[]; pollMs?: number; resetOnChange?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const [prevUrl, setPrevUrl] = useState(url);
  const tagsKey = (opts?.tags ?? []).join("|");
  const pollMs = opts?.pollMs;

  // URL changed: keep showing the previous data (stale-while-revalidate) unless asked to reset.
  if (prevUrl !== url) {
    setPrevUrl(url);
    setError(null);
    if (opts?.resetOnChange) setData(null);
  }

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    api<T>(url, { signal: ctrl.signal, cache: "no-store" })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e : new Error("Request failed"));
      });
    return () => ctrl.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!tagsKey) return;
    const tags = tagsKey.split("|");
    const onInv = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (tags.includes(t)) setNonce((n) => n + 1);
    };
    window.addEventListener(INVALIDATE_EVENT, onInv);
    return () => window.removeEventListener(INVALIDATE_EVENT, onInv);
  }, [tagsKey]);

  useEffect(() => {
    if (!pollMs || !url) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setNonce((n) => n + 1);
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, url]);

  return { data, error, loading: url !== null && data === null && error === null, reload, setData };
}

const INVALIDATE_EVENT = "fanthom:invalidate";

/** Ask every `useApi` subscribed to `tag` to refetch. */
export function invalidate(...tags: string[]) {
  if (typeof window === "undefined") return;
  for (const t of tags) window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT, { detail: t }));
}

/** True when the backend hasn't implemented this endpoint yet (501) or it doesn't exist (404 on a route). */
export function isNotReady(e: unknown): boolean {
  return e instanceof ApiClientError && (e.status === 501 || e.code === "not_implemented");
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (isNotReady(e)) return "This feature's API is still being deployed. Try again shortly.";
  return e instanceof Error ? e.message : fallback;
}

/** Debounce a fast-changing value (e.g. a search box) before it hits the network. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
