"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Link2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ClientText, HIGHLIGHT_META } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { MediaStage, useCurrentSegmentIndex } from "@/components/call/media-stage";
import { PlayerControls } from "@/components/call/player-controls";
import { PlayerProvider, usePlayer, usePlayerStore } from "@/hooks/use-player";
import { ROUTES } from "@/lib/contracts";
import { copyText } from "@/lib/ui/api";
import { alpha, formatClock, longDate } from "@/lib/ui/format";
import type { ClipDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ClipView({
  clip,
  autoPlay = false,
  onEnded,
  embedded = false,
}: {
  clip: ClipDetail;
  autoPlay?: boolean;
  onEnded?: () => void;
  embedded?: boolean;
}) {
  const { highlight, meeting } = clip;
  const bounds = { startMs: highlight.start_ms, endMs: Math.max(highlight.end_ms, highlight.start_ms + 1000) };
  return (
    <PlayerProvider durationMs={Math.max(meeting.duration_sec * 1000, bounds.endMs)} bounds={bounds} virtual={!meeting.media_url}>
      <ClipBody clip={clip} bounds={bounds} autoPlay={autoPlay} onEnded={onEnded} embedded={embedded} />
    </PlayerProvider>
  );
}

function ClipBody({
  clip,
  bounds,
  autoPlay,
  onEnded,
  embedded,
}: {
  clip: ClipDetail;
  bounds: { startMs: number; endMs: number };
  autoPlay: boolean;
  onEnded?: () => void;
  embedded: boolean;
}) {
  const { highlight, meeting, participants, segments } = clip;
  const store = usePlayerStore();
  const meta = HIGHLIGHT_META[highlight.type];
  const Icon = meta.icon;
  const [copied, setCopied] = useState(false);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const speakers = participants.filter((p) => segments.some((s) => s.participant_id === p.id));
  const ended = usePlayer((s) => !s.playing && s.currentMs >= bounds.endMs - 50);
  useEffect(() => {
    if (autoPlay) store.play();
  }, [autoPlay, store]);
  useEffect(() => {
    if (ended && onEnded) {
      const id = setTimeout(onEnded, 700);
      return () => clearTimeout(id);
    }
  }, [ended, onEnded]);

  const copy = async () => {
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Clip link copied");
    }
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl", !embedded && "px-4 py-6 md:py-10")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium"
          style={{ color: meta.color, backgroundColor: alpha(meta.color, 0.12), boxShadow: `inset 0 0 0 1px ${alpha(meta.color, 0.3)}` }}
        >
          <Icon className="size-3.5" /> {meta.label}
        </span>
        <span>
          Clip · {formatClock(bounds.endMs - bounds.startMs)} from {formatClock(bounds.startMs)}
        </span>
      </div>
      <h1 className="mt-3 text-balance text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{highlight.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        From <span className="text-white/85">{meeting.title}</span>
        {meeting.recording_start && (
          <>
            {" · "}
            <ClientText render={() => longDate(new Date(meeting.recording_start!))} placeholderWidth="12ch" />
          </>
        )}
      </p>
      {highlight.note && <p className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/80">{highlight.note}</p>}

      <div className="relative mt-6 space-y-2">
        <MediaStage
          mediaUrl={meeting.media_url}
          mediaKind={meeting.media_kind}
          participants={speakers.length ? speakers : participants}
          segments={segments}
          chapters={[]}
        />
        {ended && !onEnded && (
          <button
            type="button"
            onClick={() => store.seek(bounds.startMs, { play: true })}
            className="absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-950 shadow-[0_0_40px_-6px_rgba(96,165,250,0.9)]"
          >
            <Play className="size-4 fill-current" /> Replay clip
          </button>
        )}
        <PlayerControls bounds={bounds} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={copy} className="rounded-full bg-white text-neutral-950 hover:bg-white/90">
          {copied ? <Check /> : <Link2 />} {copied ? "Copied" : "Copy clip link"}
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={ROUTES.pages.callAt(meeting.id, bounds.startMs)}>Open full call in Fanthom</Link>
        </Button>
      </div>

      <section className="glass mt-8 rounded-2xl p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Transcript excerpt</h2>
        <Excerpt clip={clip} byId={byId} />
      </section>
    </div>
  );
}

function Excerpt({ clip, byId }: { clip: ClipDetail; byId: Map<string, ClipDetail["participants"][number]> }) {
  const store = usePlayerStore();
  const current = useCurrentSegmentIndex(clip.segments);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-i="${current}"]`);
    if (list && el) list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [current]);
  if (clip.segments.length === 0) return <p className="text-sm text-muted-foreground">No transcript for this moment.</p>;
  return (
    <ul ref={listRef} className="relative max-h-80 space-y-1 overflow-y-auto">
      {clip.segments.map((s, i) => {
        const p = s.participant_id ? byId.get(s.participant_id) : undefined;
        return (
          <li key={s.id} data-i={i}>
            <button
              type="button"
              onClick={() => store.seek(Math.max(s.start_ms, clip.highlight.start_ms))}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                i === current ? "bg-sky-400/[0.12] shadow-[inset_2px_0_0_0_#60a5fa]" : "hover:bg-white/[0.04]",
              )}
            >
              {p && <ParticipantAvatar person={p} size="sm" className="mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium" style={{ color: p?.color }}>
                    {p?.name ?? "Unknown"}
                  </span>{" "}
                  <span className="font-mono text-muted-foreground">{formatClock(s.start_ms)}</span>
                </p>
                <p className={cn("mt-0.5 text-[13.5px] leading-relaxed", i === current ? "text-white" : "text-white/75")}>{s.text}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
