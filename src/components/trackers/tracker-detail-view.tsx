"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Pencil, Radar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { DashCard, InlineBar, Kpi, PageHeader, PageShell } from "@/components/insights/dash-ui";
import { ApiClientError } from "@/lib/ui/api";
import { apiErrorMessage, useApi } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { TrackerHitsResponse } from "@/lib/contracts";
import type { TrackerHit } from "@/lib/types";
import { alpha, formatClock } from "@/lib/ui/format";
import { shortDate } from "@/lib/ui/time-ago";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/common/time-zone";
import { TrackerDialog } from "./tracker-dialog";
import { DeleteTrackerDialog } from "./trackers-view";

export function TrackerDetailView({ id, initial = null }: { id: string; initial?: TrackerHitsResponse | null }) {
  const q = useApi<TrackerHitsResponse>(`${ROUTES.api.trackerHits(id)}?limit=1000`, initial);
  const router = useRouter();
  const tz = useTimeZone();
  const [keyword, setKeyword] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const d = q.data;

  const groups = useMemo(() => {
    if (!d) return [];
    const by = new Map<string, TrackerHit[]>();
    for (const h of d.hits) {
      if (keyword && h.keyword.toLowerCase() !== keyword.toLowerCase()) continue;
      by.set(h.meeting_id, [...(by.get(h.meeting_id) ?? []), h]);
    }
    return [...by.values()]
      .map((hits) => ({ hits: dedupeBySegment(hits).sort((a, b) => a.start_ms - b.start_ms), first: hits[0] }))
      .sort((a, b) => (b.first.meeting_date ?? "").localeCompare(a.first.meeting_date ?? ""));
  }, [d, keyword]);

  const back = (
    <Link href={ROUTES.pages.trackers} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Trackers
    </Link>
  );

  if (q.error && !d) {
    const notFound = q.error instanceof ApiClientError && q.error.status === 404;
    return (
      <PageShell>
        {back}
        <DashCard className="mt-6">
          {notFound ? (
            <EmptyState icon={Radar} title="Tracker not found" description="It may have been deleted." />
          ) : (
            <ErrorState title="Couldn't load this tracker" description={apiErrorMessage(q.error)} onRetry={q.reload} />
          )}
        </DashCard>
      </PageShell>
    );
  }

  if (!d) {
    return (
      <PageShell>
        {back}
        <div className="mt-4 space-y-4" aria-busy>
          <Skeleton className="h-9 w-64" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  const t = d.tracker;
  const maxKw = Math.max(1, ...d.by_keyword.map((k) => k.hits));

  return (
    <PageShell>
      <PageHeader
        eyebrow={back}
        title={
          <span className="flex items-center gap-3">
            <span className="size-3 rounded-full" style={{ backgroundColor: t.color, boxShadow: `0 0 14px ${alpha(t.color, 0.8)}` }} />
            {t.name}
          </span>
        }
        description={t.description ?? `Mentions of ${t.keywords.slice(0, 3).join(", ")}${t.keywords.length > 3 ? "…" : ""} across your calls.`}
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-red-300 hover:text-red-200" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Kpi label="Mentions" value={t.hit_count} />
        <Kpi label="Calls" value={t.meeting_count} />
        <Kpi label="Last mentioned" value={t.last_hit_at ? shortDate(t.last_hit_at, false, tz) : "—"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <DashCard title="Keywords" className="self-start">
          <ul className="space-y-1">
            <li>
              <KeywordButton label="All keywords" count={d.hits.length} active={!keyword} onClick={() => setKeyword(null)} />
            </li>
            {t.keywords.map((k) => {
              const hits = d.by_keyword.find((x) => x.keyword.toLowerCase() === k.toLowerCase())?.hits ?? 0;
              return (
                <li key={k}>
                  <KeywordButton label={k} count={hits} active={keyword === k} onClick={() => setKeyword(keyword === k ? null : k)} disabled={!hits}>
                    <InlineBar frac={hits / maxKw} color={t.color} className="mt-1" />
                  </KeywordButton>
                </li>
              );
            })}
          </ul>
        </DashCard>

        <div className="min-w-0 space-y-3">
          {groups.length === 0 ? (
            <DashCard>
              <EmptyState
                icon={Radar}
                title={keyword ? `No mentions of “${keyword}”` : "No mentions yet"}
                description="New calls are checked automatically. Try adding related phrases."
              />
            </DashCard>
          ) : (
            groups.map((g) => (
              <DashCard
                key={g.first.meeting_id}
                title={
                  <Link href={ROUTES.pages.call(g.first.meeting_id)} className="group inline-flex items-center gap-1 hover:text-sky-200">
                    {g.first.meeting_title}
                    <ChevronRight className="size-3.5 opacity-50 group-hover:opacity-100" />
                  </Link>
                }
                action={
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(g.first.meeting_date, false, tz)} · {g.hits.length} {g.hits.length === 1 ? "mention" : "mentions"}
                  </span>
                }
                bodyClassName="pt-2 sm:pt-2"
              >
                <ul className="divide-y divide-white/[0.05]">
                  {g.hits.map((h) => (
                    <li key={h.segment_id}>
                      <Link
                        href={ROUTES.pages.callAt(h.meeting_id, h.start_ms)}
                        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
                      >
                        <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md bg-primary/12 px-1.5 font-mono text-[11px] tabular-nums text-sky-300 ring-1 ring-primary/25">
                          {formatClock(h.start_ms)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs">
                            <ParticipantAvatar person={{ name: h.speaker_name, color: h.speaker_color }} size="xs" />
                            <span style={{ color: h.speaker_color ?? undefined }}>{h.speaker_name}</span>
                          </span>
                          <span
                            className="mt-1 block text-[13px] leading-relaxed text-white/80 [&_mark]:rounded-sm [&_mark]:bg-sky-400/30 [&_mark]:px-0.5 [&_mark]:text-white"
                            dangerouslySetInnerHTML={{ __html: h.snippet }}
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </DashCard>
            ))
          )}
        </div>
      </div>

      <TrackerDialog
        open={editOpen}
        tracker={t}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          q.reload();
        }}
      />
      <DeleteTrackerDialog tracker={deleteOpen ? t : null} onClose={() => setDeleteOpen(false)} onDeleted={() => router.push(ROUTES.pages.trackers)} />
    </PageShell>
  );
}

/** One row per transcript line even when several keywords matched it; the snippet marks every matched keyword. */
function dedupeBySegment(hits: TrackerHit[]): TrackerHit[] {
  const by = new Map<string, { hit: TrackerHit; keywords: Set<string> }>();
  for (const h of hits) {
    const cur = by.get(h.segment_id);
    if (cur) cur.keywords.add(h.keyword);
    else by.set(h.segment_id, { hit: h, keywords: new Set([h.keyword]) });
  }
  return [...by.values()].map(({ hit, keywords }) => (keywords.size > 1 ? { ...hit, snippet: remark(hit.snippet, [...keywords]) } : hit));
}

function remark(snippetHtml: string, keywords: string[]): string {
  const plain = snippetHtml.replace(/<\/?mark>/g, "");
  const esc = keywords
    .map((k) => k.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  // Only replace in text, never inside an HTML entity (e.g. &#39;).
  const re = new RegExp(`(?<![\\w&#])(${esc.join("|")})(?![\\w])`, "gi");
  return plain.replace(re, "<mark>$1</mark>");
}

function KeywordButton({
  label,
  count,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-45",
        active ? "bg-white/[0.08]" : "enabled:hover:bg-white/[0.04]",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
      </span>
      {children}
    </button>
  );
}
