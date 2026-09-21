"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, MeetingTypeBadge } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useTranscriptSearch } from "@/hooks/use-search";
import { ROUTES } from "@/lib/contracts";
import { formatClock, longDate } from "@/lib/ui/format";
import type { SearchHit } from "@/lib/types";

const SUGGESTIONS = ["pricing", "security review", "pilot", "deadline", "hiring", "roadmap"];

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydrated = useHydrated();
  const { data, loading, error } = useTranscriptSearch(q, { limit: 60 });

  // Keep the URL shareable without adding history entries per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim() ? ROUTES.pages.search(q.trim()) : ROUTES.pages.search();
      if (next !== window.location.pathname + window.location.search) router.replace(next, { scroll: false });
    }, 400);
    return () => clearTimeout(t);
  }, [q, router]);

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; date: string | null; type: SearchHit["meeting_type"]; hits: SearchHit[] }>();
    for (const h of data?.hits ?? []) {
      if (!map.has(h.meeting_id))
        map.set(h.meeting_id, { title: h.meeting_title, date: h.meeting_date, type: h.meeting_type, hits: [] });
      map.get(h.meeting_id)!.hits.push(h);
    }
    for (const g of map.values()) g.hits.sort((a, b) => a.start_ms - b.start_ms);
    return [...map.entries()];
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Search</h1>
      <p className="mt-1 text-sm text-muted-foreground">Find the exact moment anything was said, across every call.</p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transcripts — e.g. “security review”"
          aria-label="Search transcripts"
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-24 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!q.trim() ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="h-7 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-white/75 transition-colors hover:border-sky-400/30 hover:bg-primary/10 hover:text-white"
            >
              {s}
            </button>
          ))}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            Tip: press <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">⌘K</kbd> anywhere
          </span>
        </div>
      ) : error ? (
        <div className="glass mt-8 rounded-2xl">
          <ErrorState title="Search failed" description={error} onRetry={() => setQ((x) => x + " ")} />
        </div>
      ) : !data ? (
        <ResultsSkeleton />
      ) : data.hits.length === 0 ? (
        <div className="glass mt-8 rounded-2xl">
          <EmptyState
            icon={Search}
            title={`No moments match “${data.query}”`}
            description="Try fewer words, or a name — search covers every transcript line."
          />
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-4 text-xs text-muted-foreground">
            {data.total} {data.total === 1 ? "moment" : "moments"} in {groups.length} {groups.length === 1 ? "call" : "calls"}
          </p>
          <div className="space-y-5">
            {groups.map(([id, g]) => (
              <section key={id} className="glass overflow-hidden rounded-2xl">
                <Link
                  href={ROUTES.pages.call(id)}
                  className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium tracking-tight">{g.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {g.date && hydrated && <span>{longDate(new Date(g.date))}</span>}
                      <MeetingTypeBadge type={g.type} />
                      <span>
                        {g.hits.length} {g.hits.length === 1 ? "match" : "matches"}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
                <ul className="divide-y divide-white/[0.04]">
                  {g.hits.map((h) => (
                    <li key={h.segment_id}>
                      <Link
                        href={ROUTES.pages.callAt(h.meeting_id, h.start_ms)}
                        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.06]"
                      >
                        <ParticipantAvatar person={{ name: h.speaker_name, color: h.speaker_color }} size="sm" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium" style={{ color: h.speaker_color ?? undefined }}>
                            {h.speaker_name}
                          </p>
                          <p
                            className="mt-0.5 text-[13.5px] leading-relaxed text-white/80"
                            // SearchHit.snippet is HTML-escaped; only <mark> is raw (see contract).
                            dangerouslySetInnerHTML={{ __html: h.snippet }}
                          />
                        </div>
                        <span className="mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-primary/12 px-2 font-mono text-[11px] tabular-nums text-sky-300 ring-1 ring-primary/25 group-hover:bg-primary/25 group-hover:text-white">
                          {formatClock(h.start_ms)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-8 space-y-5" aria-busy>
      {[3, 2].map((n, i) => (
        <div key={i} className="glass rounded-2xl p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/4" />
          <div className="mt-4 space-y-4">
            {Array.from({ length: n }).map((_, j) => (
              <div key={j} className="flex gap-3">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
