"use client";

import { memo, useMemo } from "react";
import { Filter, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HIGHLIGHT_META } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { indexAt, usePlayer, usePlayerStore } from "@/hooks/use-player";
import { alpha, firstName, formatClock, formatDuration } from "@/lib/ui/format";
import type { Chapter, Highlight, SpeakerStat, TranscriptSegment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCall } from "./call-context";

const LABEL_W = 148; // px, speaker label column

function Playhead({ durationMs, offset }: { durationMs: number; offset: number }) {
  const pct = usePlayer((s) => Math.round((s.currentMs / Math.max(1, durationMs)) * 2000) / 2000);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]"
      style={{ left: `calc(${offset}px + (100% - ${offset}px) * ${pct})` }}
    />
  );
}

export function ChapterRail({ chapters, durationMs }: { chapters: Chapter[]; durationMs: number }) {
  const store = usePlayerStore();
  const activeIdx = usePlayer((s) => indexAt(chapters, s.currentMs));
  if (chapters.length === 0) return null;
  const cur = activeIdx >= 0 ? chapters[activeIdx] : null;
  return (
    <div>
      {cur && (
        <p className="mb-2 flex items-baseline gap-2 truncate text-xs text-white/60">
          <span className="font-mono tabular-nums text-white/40">
            {activeIdx + 1}/{chapters.length}
          </span>
          <span className="truncate font-medium text-white/90">{cur.title}</span>
          <span className="shrink-0 font-mono tabular-nums text-white/40">
            {formatClock(cur.start_ms)}–{formatClock(cur.end_ms)}
          </span>
        </p>
      )}
      <div className="flex h-9 gap-[3px]">
        {chapters.map((c, i) => {
          const w = Math.max(0.5, ((c.end_ms - c.start_ms) / Math.max(1, durationMs)) * 100);
          const active = i === activeIdx;
          return (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => store.seek(c.start_ms)}
                  className={cn(
                    "relative min-w-0 overflow-hidden rounded-md border px-2 text-left text-[11px] font-medium transition-colors",
                    active
                      ? "border-sky-400/40 bg-primary/20 text-white shadow-[0_0_18px_-6px_var(--brand)]"
                      : "border-white/[0.06] bg-white/[0.035] text-white/60 hover:bg-white/[0.07] hover:text-white/90",
                  )}
                  style={{ flexBasis: `${w}%`, flexGrow: 0, flexShrink: 1 }}
                >
                  <span className={cn("block truncate", w < 8 && "text-center font-mono tabular-nums")}>
                    {w < 8 ? i + 1 : c.title}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                <div className="font-medium">
                  {c.title} <span className="font-mono text-[10px] text-white/60">{formatClock(c.start_ms)}</span>
                </div>
                {c.summary && <div className="mt-1 text-white/75">{c.summary}</div>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

interface Bar {
  start: number;
  end: number;
}

function mergeBars(segments: TranscriptSegment[], pid: string, gap: number): Bar[] {
  const out: Bar[] = [];
  for (const s of segments) {
    if (s.participant_id !== pid) continue;
    const last = out[out.length - 1];
    if (last && s.start_ms - last.end <= gap) last.end = Math.max(last.end, s.end_ms);
    else out.push({ start: s.start_ms, end: s.end_ms });
  }
  return out;
}

const SpeakerRow = memo(function SpeakerRow({
  stat,
  bars,
  durationMs,
  active,
  dimmed,
  onToggle,
  onSeek,
}: {
  stat: SpeakerStat;
  bars: Bar[];
  durationMs: number;
  active: boolean;
  dimmed: boolean;
  onToggle: () => void;
  onSeek: (ms: number) => void;
}) {
  return (
    <div className={cn("flex h-7 items-center transition-opacity", dimmed && "opacity-35 hover:opacity-80")}>
      <button
        type="button"
        onClick={onToggle}
        title={active ? "Show all speakers" : `Filter transcript to ${stat.name}`}
        className={cn(
          "flex h-full shrink-0 items-center gap-2 rounded-md pr-2 text-left text-xs transition-colors hover:bg-white/[0.05]",
          active && "bg-white/[0.06]",
        )}
        style={{ width: LABEL_W }}
      >
        <ParticipantAvatar person={stat} size="xs" />
        <span className="min-w-0 flex-1 truncate text-white/85">{firstName(stat.name)}</span>
        <span className="font-mono text-[10px] tabular-nums text-white/50">{Math.round(stat.talk_pct)}%</span>
      </button>
      <div
        className="relative h-3 flex-1 cursor-pointer rounded-sm bg-white/[0.03]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * durationMs);
        }}
      >
        {bars.map((b, i) => (
          <span
            key={i}
            className="absolute inset-y-0 rounded-[2px]"
            style={{
              left: `${(b.start / durationMs) * 100}%`,
              width: `max(2px, ${((b.end - b.start) / durationMs) * 100}%)`,
              backgroundColor: alpha(stat.color, 0.85),
            }}
          />
        ))}
      </div>
    </div>
  );
});

export function HighlightMarkers({ highlights, durationMs }: { highlights: Highlight[]; durationMs: number }) {
  const store = usePlayerStore();
  return (
    <div className="relative h-5">
      {highlights.map((h) => {
        const meta = HIGHLIGHT_META[h.type];
        const Icon = meta.icon;
        return (
          <Tooltip key={h.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => store.seek(h.start_ms)}
                aria-label={`${meta.label}: ${h.title}`}
                className="absolute top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border transition-transform hover:z-10 hover:scale-125"
                style={{
                  left: `${(h.start_ms / Math.max(1, durationMs)) * 100}%`,
                  backgroundColor: alpha(meta.color, 0.18),
                  borderColor: alpha(meta.color, 0.5),
                  color: meta.color,
                }}
              >
                <Icon className="size-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <span style={{ color: meta.color }}>{meta.label}</span> · {formatClock(h.start_ms)}
              <div className="mt-0.5 text-white/85">{h.title}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function CallTimeline() {
  const { detail, segments, highlights, speakerStats, speakerFilter, setSpeakerFilter, setTab, meeting } = useCall();
  const chapters = detail.chapters;
  const store = usePlayerStore();
  const durationMs = usePlayer((s) => s.durationMs) || meeting.duration_sec * 1000;
  const gap = Math.max(1500, durationMs / 600);
  const barsBy = useMemo(() => {
    const m = new Map<string, Bar[]>();
    for (const st of speakerStats) m.set(st.participant_id, mergeBars(segments, st.participant_id, gap));
    return m;
  }, [segments, speakerStats, gap]);
  const talkers = speakerStats.filter((s) => s.talk_ms > 0);
  const filtered = speakerFilter ? speakerStats.find((s) => s.participant_id === speakerFilter) : null;

  return (
    <section aria-label="Timeline" className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Chapters <span className="ml-1 text-white/30">{chapters.length}</span>
        </h3>
        <span className="text-[11px] text-muted-foreground">{formatDuration(durationMs / 1000)}</span>
      </div>
      <ChapterRail chapters={chapters} durationMs={durationMs} />

      <div className="relative mt-4" style={{ ["--lbl" as string]: `${LABEL_W}px` }}>
        <div className="mb-1 flex items-center">
          <div
            className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            style={{ width: LABEL_W }}
          >
            Highlights
          </div>
          <div className="relative flex-1">
            <HighlightMarkers highlights={highlights} durationMs={durationMs} />
          </div>
        </div>
        <div className="mb-1.5 mt-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Speakers · talk time
          </span>
          {filtered && (
            <button
              type="button"
              onClick={() => setSpeakerFilter(null)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-sky-400/30 bg-primary/15 px-2 text-[11px] text-sky-200 hover:bg-primary/25"
            >
              <Filter className="size-3" /> {firstName(filtered.name)} <X className="size-3" />
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {talkers.map((st) => (
            <SpeakerRow
              key={st.participant_id}
              stat={st}
              bars={barsBy.get(st.participant_id) ?? []}
              durationMs={durationMs}
              active={speakerFilter === st.participant_id}
              dimmed={!!speakerFilter && speakerFilter !== st.participant_id}
              onToggle={() => {
                const next = speakerFilter === st.participant_id ? null : st.participant_id;
                setSpeakerFilter(next);
                if (next) setTab("transcript");
              }}
              onSeek={(ms) => store.seek(ms)}
            />
          ))}
        </div>
        <Playhead durationMs={durationMs} offset={LABEL_W} />
      </div>
    </section>
  );
}
