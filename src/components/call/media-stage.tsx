"use client";

import { useCallback, useMemo } from "react";
import { Loader2, Play } from "lucide-react";
import { indexAt, usePlayer, usePlayerStore } from "@/hooks/use-player";
import { alpha, firstName, initials } from "@/lib/ui/format";
import type { Chapter, MediaKind, Participant, TranscriptSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Index of the segment being spoken at `t` (null when in a silence gap). */
export function useActiveSegmentIndex(segments: TranscriptSegment[], graceMs = 600): number {
  return usePlayer((s) => {
    const i = indexAt(segments, s.currentMs);
    if (i < 0) return -1;
    return s.currentMs <= segments[i].end_ms + graceMs ? i : -1;
  });
}

/** Index of the last segment that started (sticky; used for transcript highlight). */
export function useCurrentSegmentIndex(segments: TranscriptSegment[]): number {
  return usePlayer((s) => indexAt(segments, s.currentMs));
}

function gridCols(n: number): string {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-2";
  if (n <= 6) return "grid-cols-3";
  return "grid-cols-3 sm:grid-cols-4";
}

export function MediaStage({
  mediaUrl,
  mediaKind,
  participants,
  segments,
  chapters,
  showCaptions = true,
  compact = false,
  className,
}: {
  mediaUrl: string | null;
  mediaKind: MediaKind;
  participants: Participant[];
  segments: TranscriptSegment[];
  chapters: Chapter[];
  showCaptions?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const store = usePlayerStore();
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const atStart = usePlayer((s) => s.currentMs < (store.bounds?.startMs ?? 0) + 50);
  const activeIdx = useActiveSegmentIndex(segments);
  const activeSpeaker = activeIdx >= 0 ? segments[activeIdx].participant_id : null;
  const chapterIdx = usePlayer((s) => indexAt(chapters, s.currentMs));
  const chapter = chapterIdx >= 0 ? chapters[chapterIdx] : null;

  const attach = useCallback((el: HTMLMediaElement | null) => store.attach(el), [store]);
  const isVideo = mediaKind === "video" && !!mediaUrl;

  // Speakers who never talk still get a tile, but talkers come first.
  const tiles = useMemo(() => {
    const talked = new Set(segments.map((s) => s.participant_id));
    return [...participants].sort((a, b) => Number(talked.has(b.id)) - Number(talked.has(a.id)));
  }, [participants, segments]);
  const activeSeg = activeIdx >= 0 ? segments[activeIdx] : null;
  const speaker = activeSeg?.participant_id ? participants.find((p) => p.id === activeSeg.participant_id) : null;

  return (
    <div
      className={cn(
        "group/stage relative aspect-video w-full overflow-hidden rounded-2xl border border-white/8 bg-[#060a14] shadow-[0_30px_80px_-40px_rgba(59,130,246,0.45)]",
        className,
      )}
    >
      {isVideo ? (
        <video
          ref={attach}
          src={mediaUrl ?? undefined}
          preload="metadata"
          playsInline
          className="absolute inset-0 size-full bg-black object-contain"
          onClick={store.toggle}
        />
      ) : (
        <>
          {mediaUrl && <audio ref={attach} src={mediaUrl} preload="metadata" className="hidden" />}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(59,130,246,0.14),transparent_70%)]"
          />
          <div
            className={cn(
              "absolute inset-0 grid auto-rows-fr gap-1.5 p-2 sm:gap-2 sm:p-3",
              gridCols(tiles.length),
              compact && "gap-1 p-1.5",
            )}
            onClick={store.toggle}
          >
            {tiles.map((p) => (
              <Tile key={p.id} p={p} active={p.id === activeSpeaker} playing={playing} compact={compact} count={tiles.length} />
            ))}
          </div>
        </>
      )}

      {/* Top overlay: chapter */}
      {chapter && !compact && (
        <div className="pointer-events-none absolute left-3 top-3 hidden max-w-[70%] truncate rounded-full sm:block border border-white/10 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
          {chapter.title}
        </div>
      )}

      {/* Captions */}
      {showCaptions && activeSeg && !compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
          <p className="line-clamp-2 max-w-[92%] rounded-lg bg-black/70 px-3 py-1.5 text-center text-[12px] leading-snug text-white/95 backdrop-blur sm:text-[13px]">
            {speaker && (
              <span className="mr-1.5 font-semibold" style={{ color: speaker.color }}>
                {firstName(speaker.name)}:
              </span>
            )}
            {activeSeg.text}
          </p>
        </div>
      )}

      {/* Center play affordance */}
      {!playing && atStart && (
        <button
          type="button"
          onClick={store.play}
          aria-label="Play recording"
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_0_40px_-4px_rgba(96,165,250,0.8)] transition-transform hover:scale-105"
        >
          <Play className="ml-0.5 size-6 fill-current" />
        </button>
      )}
      {buffering && playing && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 p-1.5">
          <Loader2 className="size-4 animate-spin text-white/80" />
        </div>
      )}
    </div>
  );
}

function Tile({
  p,
  active,
  playing,
  compact,
  count,
}: {
  p: Participant;
  active: boolean;
  playing: boolean;
  compact: boolean;
  count: number;
}) {
  const big = count <= 4 && !compact;
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border bg-[#0b1222] transition-[box-shadow,border-color] duration-300",
        active ? "border-sky-400/80" : "border-white/[0.06]",
      )}
      style={
        active
          ? { boxShadow: `0 0 0 1px rgba(56,189,248,0.6), 0 0 28px -4px rgba(59,130,246,0.75), inset 0 0 40px -10px ${alpha(p.color, 0.5)}` }
          : undefined
      }
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{ background: `radial-gradient(70% 70% at 50% 40%, ${alpha(p.color, active ? 0.28 : 0.12)}, transparent 70%)` }}
      />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full font-semibold tracking-tight transition-transform duration-300",
          big ? "size-10 text-sm sm:size-20 sm:text-2xl" : compact ? "size-7 text-[10px]" : "size-8 text-[11px] sm:size-12 sm:text-base",
          active && "scale-105",
        )}
        style={{
          background: `linear-gradient(${alpha(p.color, 0.28)}, ${alpha(p.color, 0.28)}), #0b1120`,
          color: p.color,
          boxShadow: `inset 0 0 0 1px ${alpha(p.color, 0.45)}`,
        }}
      >
        {initials(p.name)}
        {active && playing && (
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full"
            style={{ boxShadow: `0 0 0 2px ${alpha(p.color, 0.5)}`, animationDuration: "1.6s" }}
          />
        )}
      </span>
      {!compact && (
        <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1">
          <span className="truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur sm:text-[11px]">
            {count > 6 ? firstName(p.name) : p.name}
            {p.is_external && <span className="ml-1 text-white/50">· ext</span>}
          </span>
          {active && <EqBars playing={playing} />}
        </div>
      )}
    </div>
  );
}

function EqBars({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px] rounded bg-black/55 px-1 py-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-full bg-sky-300", playing ? "animate-eq" : "h-1")}
          style={playing ? { animationDelay: `${i * 0.15}s` } : undefined}
        />
      ))}
    </span>
  );
}
