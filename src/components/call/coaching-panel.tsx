"use client";

import { useMemo, useState } from "react";
import { Activity, Gauge, Hourglass, Megaphone, MessageCircleQuestion, Radar, Scissors, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, TimestampChip } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useApi, apiErrorMessage } from "@/hooks/use-api";
import { usePlayerStore } from "@/hooks/use-player";
import { computeCoachingMetrics } from "@/lib/analytics/coaching";
import { ROUTES } from "@/lib/routes";
import type { CoachingResponse } from "@/lib/contracts";
import type { CoachingMetrics, SpeakerCoachingMetrics, TrackerHit } from "@/lib/types";
import { alpha, firstName, formatClock } from "@/lib/ui/format";
import { cn } from "@/lib/utils";
import { useCall } from "./call-context";
import { useCallExtras } from "./call-extras";

function fmtSec(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function CoachingPanel({ active }: { active: boolean }) {
  const { meeting, detail, participants, segments } = useCall();
  // Fetch lazily on first reveal, then keep the result.
  const [armed, setArmed] = useState(active);
  if (active && !armed) setArmed(true);
  const q = useApi<CoachingResponse>(armed ? ROUTES.api.coaching(meeting.id) : null);

  // Fallback: metrics are pure functions of the transcript, so compute locally if the API is unavailable.
  const local = useMemo<CoachingMetrics | null>(() => {
    if (!q.error) return null;
    try {
      return computeCoachingMetrics({ meeting: detail.meeting, participants, segments });
    } catch {
      return null;
    }
  }, [q.error, detail.meeting, participants, segments]);

  const metrics = q.data?.metrics ?? local;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-3 pb-8 pt-3 [scrollbar-width:thin]">
      {metrics ? (
        <CoachingBody m={metrics} />
      ) : q.error ? (
        <ErrorState title="Couldn't load coaching metrics" description={apiErrorMessage(q.error)} onRetry={q.reload} />
      ) : (
        <CoachingSkeleton />
      )}
    </div>
  );
}

function CoachingSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
  tone,
  children,
}: {
  icon: typeof Activity;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  onClick?: () => void;
  tone?: "good" | "warn" | null;
  children?: React.ReactNode;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-left",
        onClick && "transition-colors hover:border-sky-400/30 hover:bg-white/[0.045]",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        <Icon className="size-3.5 text-sky-300/80" /> {label}
      </span>
      <span className="mt-1.5 flex items-baseline gap-1.5 text-xl font-semibold tracking-tight tabular-nums">
        {value}
        {tone && (
          <span className={cn("size-1.5 rounded-full", tone === "good" ? "bg-emerald-400" : "bg-amber-400")} aria-hidden />
        )}
      </span>
      {hint && <span className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</span>}
      {children}
    </Comp>
  );
}

function CoachingBody({ m }: { m: CoachingMetrics }) {
  const store = usePlayerStore();
  const { participants } = useCall();
  const speakers = m.speakers;
  if (speakers.length === 0) {
    return <EmptyState icon={Activity} title="No speech to analyze" description="Coaching metrics appear once the transcript is ready." />;
  }
  const hasExternal = participants.some((p) => p.is_external);
  const mono = [...speakers].sort((a, b) => b.longest_monologue_ms - a.longest_monologue_ms)[0];
  const totalWords = speakers.reduce((a, s) => a + s.words, 0);
  const wpm = Math.round(totalWords / Math.max(1 / 60, m.total_talk_ms / 60_000));
  const fillerPer100 = totalWords ? (m.filler_words / totalWords) * 100 : 0;
  const fillers = aggregateFillers(speakers);
  const topAsker = [...speakers].sort((a, b) => b.questions_asked - a.questions_asked)[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={Megaphone}
          label="Talk ratio"
          value={hasExternal ? `${Math.round(m.internal_talk_pct)}/${Math.round(m.external_talk_pct)}` : `${speakers.length}`}
          hint={hasExternal ? "Our team / external" : "Speakers"}
          tone={hasExternal ? (m.internal_talk_pct <= 60 ? "good" : "warn") : null}
        >
          {hasExternal && (
            <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="bg-sky-400" style={{ width: `${m.internal_talk_pct}%` }} />
              <span className="bg-amber-300/80" style={{ width: `${m.external_talk_pct}%` }} />
            </span>
          )}
        </StatCard>
        <StatCard
          icon={Timer}
          label="Longest monologue"
          value={fmtSec(mono.longest_monologue_ms)}
          hint={
            <>
              {firstName(mono.name)}
              {mono.longest_monologue_start_ms != null && ` · at ${formatClock(mono.longest_monologue_start_ms)}`}
            </>
          }
          tone={mono.longest_monologue_ms <= 150_000 ? "good" : "warn"}
          onClick={mono.longest_monologue_start_ms != null ? () => store.seek(mono.longest_monologue_start_ms!) : undefined}
        />
        <StatCard
          icon={MessageCircleQuestion}
          label="Questions"
          value={m.questions_asked}
          hint={topAsker.questions_asked > 0 ? `Most from ${firstName(topAsker.name)} (${topAsker.questions_asked})` : "None asked"}
        />
        <StatCard
          icon={Scissors}
          label="Filler words"
          value={m.filler_words}
          hint={`${fillerPer100.toFixed(1)} per 100 words`}
          tone={fillerPer100 <= 3 ? "good" : "warn"}
        />
        <StatCard icon={Activity} label="Interruptions" value={m.interruptions} hint={`${m.speaker_switches} speaker switches`} />
        <StatCard
          icon={Gauge}
          label="Pace"
          value={
            <>
              {wpm}
              <span className="text-xs font-normal text-muted-foreground">wpm</span>
            </>
          }
          hint="Ideal 110–170 wpm"
          tone={wpm >= 110 && wpm <= 170 ? "good" : "warn"}
        />
        <StatCard
          icon={Hourglass}
          label="Patience"
          value={fmtSec(m.avg_patience_ms)}
          hint="Avg pause before replying"
          tone={m.avg_patience_ms >= 600 ? "good" : "warn"}
        />
        <StatCard
          icon={Timer}
          label="Silence"
          value={fmtSec(m.silence_ms)}
          hint={`${Math.round((m.silence_ms / Math.max(1, m.duration_ms)) * 100)}% of the call`}
        />
      </div>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Per speaker</h3>
        <ul className="space-y-2.5">
          {speakers.map((s) => (
            <SpeakerRow key={s.participant_id} s={s} onSeek={(ms) => store.seek(ms)} />
          ))}
        </ul>
      </section>

      {fillers.length > 0 && (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top filler words</h3>
          <div className="flex flex-wrap gap-1.5">
            {fillers.slice(0, 10).map((f) => (
              <span key={f.word} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 text-xs">
                “{f.word}” <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{f.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <TrackerSection />
    </div>
  );
}

function aggregateFillers(speakers: SpeakerCoachingMetrics[]) {
  const m = new Map<string, number>();
  for (const s of speakers) for (const f of s.filler_breakdown) m.set(f.word, (m.get(f.word) ?? 0) + f.count);
  return [...m.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

function SpeakerRow({ s, onSeek }: { s: SpeakerCoachingMetrics; onSeek: (ms: number) => void }) {
  return (
    <li>
      <div className="flex items-center gap-2">
        <ParticipantAvatar person={s} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {s.name}
          {s.is_external && <span className="ml-1.5 text-[10px] text-amber-200/80">External</span>}
        </span>
        <span className="font-mono text-xs tabular-nums text-white/80">{Math.round(s.talk_pct)}%</span>
      </div>
      <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1, s.talk_pct)}%`, backgroundColor: alpha(s.color, 0.9) }} />
      </div>
      <div className="ml-8 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          <span className="tabular-nums text-white/75">{Math.round(s.words_per_minute)}</span> wpm
        </span>
        <span>
          <span className="tabular-nums text-white/75">{s.questions_asked}</span> questions
        </span>
        <span>
          <span className="tabular-nums text-white/75">{s.filler_per_100_words.toFixed(1)}</span> fillers/100w
        </span>
        <span>
          <span className="tabular-nums text-white/75">{s.interruptions}</span> interruptions
        </span>
        <span className="inline-flex items-center gap-1">
          monologue <span className="tabular-nums text-white/75">{fmtSec(s.longest_monologue_ms)}</span>
          {s.longest_monologue_start_ms != null && (
            <TimestampChip ms={s.longest_monologue_start_ms} onClick={() => onSeek(s.longest_monologue_start_ms!)} className="h-4 text-[10px]" />
          )}
        </span>
      </div>
    </li>
  );
}

function TrackerSection() {
  const { trackers } = useCallExtras();
  const store = usePlayerStore();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    if (trackers.status !== "ready") return [];
    const by = new Map<string, TrackerHit[]>();
    for (const h of trackers.data.hits) by.set(h.tracker_id, [...(by.get(h.tracker_id) ?? []), h]);
    return trackers.data.trackers
      .map((t) => ({ t, hits: by.get(t.id) ?? [] }))
      .filter((g) => g.hits.length > 0)
      .sort((a, b) => b.hits.length - a.hits.length);
  }, [trackers]);

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Trackers in this call</h3>
        <a href={ROUTES.pages.trackers} className="text-[11px] text-sky-300 hover:underline">
          Manage
        </a>
      </div>
      {trackers.status === "loading" ? (
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ) : trackers.status === "error" ? (
        <p className="text-xs text-muted-foreground">Trackers unavailable — {trackers.message}</p>
      ) : groups.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radar className="size-3.5" /> No tracked keywords were mentioned.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {groups.map(({ t, hits }) => (
              <button
                key={t.id}
                type="button"
                aria-expanded={open === t.id}
                onClick={() => {
                  setOpen(open === t.id ? null : t.id);
                  store.seek(hits[0].start_ms);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                  open === t.id ? "bg-white/[0.08]" : "bg-white/[0.02] hover:bg-white/[0.06]",
                )}
                style={{ borderColor: alpha(t.color, 0.45) }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{hits.length}</span>
              </button>
            ))}
          </div>
          {open && (
            <ul className="mt-2.5 space-y-1">
              {groups
                .find((g) => g.t.id === open)
                ?.hits.map((h) => (
                  <li key={`${h.segment_id}-${h.keyword}`}>
                    <button
                      type="button"
                      onClick={() => store.seek(h.start_ms)}
                      className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/[0.04]"
                    >
                      <TimestampChip ms={h.start_ms} inert />
                      <span className="min-w-0 flex-1 text-xs leading-relaxed text-white/75">
                        <span className="font-medium" style={{ color: h.speaker_color ?? undefined }}>
                          {firstName(h.speaker_name)}:
                        </span>{" "}
                        <span className="[&_mark]:rounded-sm [&_mark]:bg-sky-400/30 [&_mark]:px-0.5 [&_mark]:text-white" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
