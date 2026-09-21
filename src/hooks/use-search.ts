"use client";

import { useEffect, useState } from "react";
import { ROUTES, type SearchResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";

export interface SearchState {
  data: SearchResponse | null;
  loading: boolean;
  error: string | null;
  query: string; // the query `data` belongs to
}

/** Debounced transcript search against GET /api/search. */
export function useTranscriptSearch(q: string, { limit = 30, delay = 200 }: { limit?: number; delay?: number } = {}) {
  const [state, setState] = useState<SearchState>({ data: null, loading: false, error: null, query: "" });
  const needle = q.trim();

  useEffect(() => {
    if (!needle) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const params = new URLSearchParams({ q: needle, limit: String(limit) });
      api<SearchResponse>(`${ROUTES.api.search}?${params}`, { signal: ctrl.signal })
        .then((data) => setState({ data, loading: false, error: null, query: needle }))
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Search failed" }));
        });
    }, delay);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [needle, limit, delay]);

  if (!needle) return { data: null, loading: false, error: null, query: "" } satisfies SearchState;
  // While the debounce hasn't fired for a new query, report loading.
  return { ...state, loading: state.loading || state.query !== needle };
}
