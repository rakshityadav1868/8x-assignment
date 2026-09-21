"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarStack } from "@/components/common/participant-avatar";
import { EmptyState, ErrorState, MeetingTypeBadge } from "@/components/common/bits";
import { useHydrated } from "@/hooks/use-hydrated";
import { ROUTES } from "@/lib/contracts";
import { MEETING_TYPE_LABELS } from "@/lib/templates";
import { dayKey, dayLabel, formatDuration, timeOfDay } from "@/lib/ui/format";
import type { MeetingListItem, UpcomingMeeting } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CallsListSkeleton, UpcomingSkeleton } from "./calls-skeleton";
import { CallThumb } from "./call-thumb";

export function CallsView({
  meetings,
  upcoming,
  error,
}: {
  meetings: MeetingListItem[];
  upcoming: UpcomingMeeting[];
  error: string | null;
}) {
  const hydrated = useHydrated();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return meetings;
    return meetings.filter(
      (m) =>
        m.title.toLowerCase().includes(needle) ||
        (MEETING_TYPE_LABELS[m.meeting_type] ?? "").toLowerCase().includes(needle) ||
        m.participants.some((p) => p.name.toLowerCase().includes(needle)),
    );
  }, [meetings, q]);

  const groups = useMemo(() => {
    if (!hydrated) return [];
    const now = new Date();
    const map = new Map<string, { label: string; items: MeetingListItem[] }>();
    for (const m of filtered) {
      const d = new Date(m.recording_start ?? m.scheduled_start ?? m.created_at);
      const k = dayKey(d);
      if (!map.has(k)) map.set(k, { label: dayLabel(d, now), items: [] });
      map.get(k)!.items.push(m);
    }
    return [...map.values()];
  }, [filtered, hydrated]);

  const totalSec = meetings.reduce((a, m) => a + m.duration_sec, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">My Calls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meetings.length > 0
              ? `${meetings.length} recordings · ${formatDuration(totalSec)} of conversations, transcribed and summarized.`
              : "Recordings, transcripts and AI notes from your meetings."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter calls or people…"
              aria-label="Filter calls"
              className="h-9 w-full rounded-full border border-border bg-white/[0.04] pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:bg-white/[0.06]"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Button asChild className="h-9 rounded-full px-4">
            <Link href={ROUTES.pages.upload}>
              <Upload /> <span className="hidden sm:inline">Upload</span>
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="glass mt-10 rounded-2xl">
          <ErrorState
            title="Couldn't load your calls"
            description={error}
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : (
        <>
          {!hydrated ? <UpcomingSkeleton /> : upcoming.length > 0 && !q && <UpcomingStrip upcoming={upcoming} />}

          <div className="mt-10">
            {!hydrated ? (
              <CallsListSkeleton />
            ) : meetings.length === 0 ? (
              <div className="glass rounded-2xl">
                <EmptyState
                  icon={Video}
                  title="No calls yet"
                  description="Upload a recording and Fanthom will transcribe, summarize and pull out action items."
                  action={
                    <Button asChild className="rounded-full">
                      <Link href={ROUTES.pages.upload}>
                        <Upload /> Upload a recording
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : groups.length === 0 ? (
              <div className="glass rounded-2xl">
                <EmptyState
                  icon={Search}
                  title={`No calls match “${q}”`}
                  description="Titles, people and meeting types are filtered here. Want to search what was said?"
                  action={
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={ROUTES.pages.search(q)}>
                        Search transcripts <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {groups.map((g) => (
                  <section key={g.label} aria-label={g.label}>
                    <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                      {g.label}
                    </h2>
                    <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
                      {g.items.map((m) => (
                        <CallRow key={m.id} m={m} />
                      ))}
                    </ul>
                  </section>
                ))}
                {q && (
                  <Link
                    href={ROUTES.pages.search(q)}
                    className="inline-flex items-center gap-1.5 self-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Search className="size-3.5" /> Search transcripts for “{q}” <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CallRow({ m }: { m: MeetingListItem }) {
  const start = new Date(m.recording_start ?? m.scheduled_start ?? m.created_at);
  const ready = m.status === "ready";
  const external = m.participants.some((p) => p.is_external);
  const body = (
    <>
      <CallThumb meeting={m} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium tracking-tight group-hover:text-white">{m.title}</p>
          {external && (
            <span className="hidden shrink-0 rounded-full border border-white/10 px-1.5 text-[10px] text-muted-foreground sm:inline">
              External
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{timeOfDay(start)}</span>
          <span aria-hidden className="text-white/20">
            •
          </span>
          <span>{formatDuration(m.duration_sec)}</span>
          <MeetingTypeBadge type={m.meeting_type} className="ml-1" />
          {ready && (m.highlight_count > 0 || m.action_item_count > 0) && (
            <span className="hidden items-center gap-3 pl-1 sm:flex">
              {m.highlight_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3 text-sky-300/80" /> {m.highlight_count}
                </span>
              )}
              {m.action_item_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <CircleCheck className="size-3 text-emerald-300/80" /> {m.action_item_count}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill m={m} />
        <AvatarStack people={m.participants} max={4} className="hidden sm:flex" />
        <ArrowRight className="hidden size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 md:block" />
      </div>
    </>
  );
  return (
    <li>
      <Link
        href={ROUTES.pages.call(m.id)}
        className="group flex min-h-[76px] items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none"
      >
        {body}
      </Link>
    </li>
  );
}

function StatusPill({ m }: { m: MeetingListItem }) {
  if (m.status === "processing")
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/12 px-2.5 text-[11px] font-medium text-sky-300">
        <Loader2 className="size-3 animate-spin" />
        {m.processing_stage === "transcribing" ? "Transcribing" : m.processing_stage === "analyzing" ? "Analyzing" : "Processing"}
      </span>
    );
  if (m.status === "failed")
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 text-[11px] font-medium text-red-300">
        <AlertCircle className="size-3" /> Failed
      </span>
    );
  return null;
}

function UpcomingStrip({ upcoming }: { upcoming: UpcomingMeeting[] }) {
  const now = new Date();
  const sorted = [...upcoming].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
  return (
    <section className="mt-8" aria-label="Upcoming meetings">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Upcoming</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3.5" /> Calendar sync is simulated
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-56">
            Calendar OAuth and the live recording bot are stubbed in this demo; these meetings are seeded.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        {sorted.map((u, i) => {
          const s = new Date(u.start);
          const e = new Date(u.end);
          const soon = s.getTime() - now.getTime() < 60 * 60 * 1000 && s.getTime() > now.getTime();
          return (
            <div
              key={u.id}
              className={cn(
                "glass relative w-64 shrink-0 snap-start overflow-hidden rounded-2xl p-4",
                i === 0 && "border-primary/30 shadow-[0_0_40px_-18px_var(--brand)]",
              )}
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {dayLabel(s, now)} · {timeOfDay(s)}–{timeOfDay(e)}
                </span>
                {soon && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-sky-300">Soon</span>}
              </div>
              <p className="mt-2 truncate text-sm font-medium tracking-tight">{u.title}</p>
              <div className="mt-3 flex items-center justify-between">
                <AvatarStack people={u.attendees} max={4} size="xs" />
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Mic className="size-3 text-primary" /> Fanthom joins
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
