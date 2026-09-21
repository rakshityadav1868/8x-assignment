"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Pause, Play, Plus, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HIGHLIGHT_META } from "@/components/common/bits";
import { PlayerProvider, indexAt, usePlayer, usePlayerStore } from "@/hooks/use-player";
import { apiErrorMessage } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { HighlightResponse } from "@/lib/contracts";
import type { Highlight, HighlightType, TranscriptSegment } from "@/lib/types";
import { api, copyText } from "@/lib/ui/api";
import { alpha, formatClock } from "@/lib/ui/format";
import { cn } from "@/lib/utils";
import { useCall } from "./call-context";
import { MediaStage } from "./media-stage";

export type TrimTarget =
  | { kind: "create"; type: HighlightType; seg: TranscriptSegment }
  | { kind: "edit"; highlight: Highlight };

const MAX_CLIP_MS = 10 * 60 * 1000;
const MIN_CLIP_MS = 1000;
const BUCKETS = 140;

function clipTitle(text: string): string {
  return text.length > 90 ? `${text.slice(0, 87).trimEnd()}…` : text;
}

/** Deterministic 0..1 hash so the "waveform" is stable across renders. */
function hash01(s: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Clip trim editor: mini waveform-ish strip of the surrounding context (speech density colored by
 * speaker), draggable start/end handles, ±1s nudges, preview playback bounded to the range.
 */
export function ClipTrimDialog({ target, onClose }: { target: TrimTarget | null; onClose: () => void }) {
  const mainStore = usePlayerStore();
  const { meeting, segments } = useCall();
  useEffect(() => {
    if (target) mainStore.pause();
  }, [target, mainStore]);
  const durationMs = Math.max(meeting.duration_sec * 1000, segments.at(-1)?.end_ms ?? 0);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {target && (
          <PlayerProvider
            key={target.kind === "edit" ? target.highlight.id : target.seg.id}
            durationMs={durationMs}
            virtual={!meeting.media_url}
            bounds={initialRange(target)}
          >
            <TrimBody target={target} durationMs={durationMs} onClose={onClose} />
          </PlayerProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function initialRange(t: TrimTarget): { startMs: number; endMs: number } {
  if (t.kind === "edit") return { startMs: t.highlight.start_ms, endMs: t.highlight.end_ms };
  return { startMs: t.seg.start_ms, endMs: Math.max(t.seg.end_ms, t.seg.start_ms + MIN_CLIP_MS) };
}

function TrimBody({ target, durationMs, onClose }: { target: TrimTarget; durationMs: number; onClose: () => void }) {
  const { meeting, segments, participantById, participants, setHighlights } = useCall();
  const store = usePlayerStore();
  const playing = usePlayer((s) => s.playing);
  const init = initialRange(target);
  const [range, setRange] = useState(init);
  const [title, setTitle] = useState(target.kind === "edit" ? target.highlight.title : clipTitle(target.seg.text));
  const [saving, setSaving] = useState(false);
  const type = target.kind === "edit" ? target.highlight.type : target.type;
  const meta = HIGHLIGHT_META[type];

  // Context window around the clip (fixed while dragging so handles don't "swim").
  const [win] = useState(() => {
    const len = init.endMs - init.startMs;
    const pad = Math.max(20_000, len);
    return { start: Math.max(0, init.startMs - pad), end: Math.min(durationMs, init.endMs + pad) };
  });
  const span = Math.max(1, win.end - win.start);

  useEffect(() => {
    store.setBounds({ startMs: range.startMs, endMs: range.endMs });
    const cur = store.getState().currentMs;
    if (cur < range.startMs || cur > range.endMs) store.seek(range.startMs);
  }, [range, store]);

  const bars = useMemo(() => {
    const out: { h: number; color: string | null }[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const t = win.start + ((i + 0.5) / BUCKETS) * span;
      const idx = indexAt(segments, t);
      const seg = idx >= 0 && segments[idx].end_ms >= t ? segments[idx] : null;
      if (!seg) out.push({ h: 0.08 + hash01("s", i) * 0.06, color: null });
      else {
        const p = seg.participant_id ? participantById.get(seg.participant_id) : undefined;
        out.push({ h: 0.3 + hash01(seg.id, i) * 0.7, color: p?.color ?? "#94a3b8" });
      }
    }
    return out;
  }, [win, span, segments, participantById]);

  const trackRef = useRef<HTMLDivElement>(null);
  const msAt = useCallback(
    (clientX: number) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return win.start;
      return win.start + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span;
    },
    [win.start, span],
  );

  const clamp = useCallback(
    (next: { startMs: number; endMs: number }, moved: "start" | "end") => {
      let { startMs, endMs } = next;
      startMs = Math.max(0, Math.round(startMs));
      endMs = Math.min(durationMs, Math.round(endMs));
      if (moved === "start") {
        startMs = Math.min(startMs, endMs - MIN_CLIP_MS);
        startMs = Math.max(startMs, endMs - MAX_CLIP_MS);
      } else {
        endMs = Math.max(endMs, startMs + MIN_CLIP_MS);
        endMs = Math.min(endMs, startMs + MAX_CLIP_MS);
      }
      return { startMs: Math.max(0, startMs), endMs: Math.min(durationMs, endMs) };
    },
    [durationMs],
  );

  const drag = (which: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const ms = msAt(ev.clientX);
      setRange((r) => clamp(which === "start" ? { ...r, startMs: ms } : { ...r, endMs: ms }, which));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const nudge = (which: "start" | "end", delta: number) =>
    setRange((r) => clamp(which === "start" ? { ...r, startMs: r.startMs + delta } : { ...r, endMs: r.endMs + delta }, which));

  const onHandleKey = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5000 : 1000;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudge(which, -step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudge(which, step);
    }
  };

  const preview = () => {
    if (playing) return store.pause();
    store.seek(range.startMs);
    store.play();
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return toast.error("Give the clip a title");
    setSaving(true);
    try {
      let h: Highlight;
      if (target.kind === "create") {
        const r = await api<HighlightResponse>(ROUTES.api.highlights(meeting.id), {
          method: "POST",
          json: { start_ms: range.startMs, end_ms: range.endMs, type, title: t },
        });
        h = r.highlight;
        setHighlights((prev) => [...prev, h].sort((a, b) => a.start_ms - b.start_ms));
        const url = `${window.location.origin}${ROUTES.pages.clip(h.share_token)}`;
        toast.success(`${meta.label} clip saved`, {
          description: `${formatClock(h.start_ms)}–${formatClock(h.end_ms)}`,
          action: { label: "Copy clip link", onClick: () => void copyText(url).then(() => toast.success("Clip link copied")) },
        });
      } else {
        const r = await api<HighlightResponse>(ROUTES.api.highlight(target.highlight.id), {
          method: "PATCH",
          json: { start_ms: range.startMs, end_ms: range.endMs, title: t },
        });
        h = r.highlight;
        setHighlights((prev) => prev.map((x) => (x.id === h.id ? h : x)).sort((a, b) => a.start_ms - b.start_ms));
        toast.success("Clip updated", { description: `${formatClock(h.start_ms)}–${formatClock(h.end_ms)}` });
      }
      store.pause();
      onClose();
    } catch (e) {
      toast.error("Couldn't save clip", { description: apiErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const pct = (ms: number) => ((ms - win.start) / span) * 100;
  const len = range.endMs - range.startMs;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full" style={{ color: meta.color, backgroundColor: alpha(meta.color, 0.15) }}>
            <Scissors className="size-3.5" />
          </span>
          {target.kind === "create" ? `New ${meta.label.toLowerCase()} clip` : "Edit clip"}
        </DialogTitle>
        <DialogDescription>Drag the handles or nudge by a second. Preview plays only the selected range.</DialogDescription>
      </DialogHeader>

      <MediaStage
        mediaUrl={meeting.media_url}
        mediaKind={meeting.media_kind}
        participants={participants}
        segments={segments}
        chapters={[]}
        compact
        className="aspect-[16/6] rounded-xl shadow-none"
      />

      <div className="select-none">
        <div className="mb-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>{formatClock(win.start)}</span>
          <span>{formatClock(win.end)}</span>
        </div>
        <div
          ref={trackRef}
          className="relative h-16 cursor-pointer rounded-lg border border-white/8 bg-white/[0.02]"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const ms = msAt(e.clientX);
            if (ms >= range.startMs && ms <= range.endMs) store.seek(ms);
          }}
        >
          <div className="absolute inset-x-1 inset-y-2 flex items-center gap-px">
            {bars.map((b, i) => {
              const t = win.start + ((i + 0.5) / BUCKETS) * span;
              const inside = t >= range.startMs && t <= range.endMs;
              return (
                <span
                  key={i}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${Math.round(b.h * 100)}%`,
                    backgroundColor: b.color ? alpha(b.color, inside ? 0.95 : 0.25) : inside ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                  }}
                />
              );
            })}
          </div>
          {/* selection */}
          <div
            className="pointer-events-none absolute inset-y-0 rounded-md border-y-2 border-sky-400/80 bg-sky-400/[0.07]"
            style={{ left: `${pct(range.startMs)}%`, width: `${pct(range.endMs) - pct(range.startMs)}%` }}
          />
          <PreviewHead pct={pct} />
          <Handle side="start" leftPct={pct(range.startMs)} onPointerDown={drag("start")} onKeyDown={onHandleKey("start")} ms={range.startMs} />
          <Handle side="end" leftPct={pct(range.endMs)} onPointerDown={drag("end")} onKeyDown={onHandleKey("end")} ms={range.endMs} />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Nudger label="Start" ms={range.startMs} onMinus={() => nudge("start", -1000)} onPlus={() => nudge("start", 1000)} />
          <Button variant="outline" size="sm" onClick={preview} className="rounded-full" aria-label={playing ? "Pause preview" : "Preview clip"}>
            {playing ? <Pause /> : <Play />} {formatClock(len)}
          </Button>
          <Nudger label="End" ms={range.endMs} onMinus={() => nudge("end", -1000)} onPlus={() => nudge("end", 1000)} align="end" />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          maxLength={200}
          className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
        />
      </label>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {target.kind === "create" ? "Save clip" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

function PreviewHead({ pct }: { pct: (ms: number) => number }) {
  const ms = usePlayer((s) => Math.round(s.currentMs / 100) * 100);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
      style={{ left: `${pct(ms)}%` }}
    />
  );
}

function Handle({
  side,
  leftPct,
  ms,
  onPointerDown,
  onKeyDown,
}: {
  side: "start" | "end";
  leftPct: number;
  ms: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={side === "start" ? "Clip start" : "Clip end"}
      aria-valuetext={formatClock(ms)}
      aria-valuenow={Math.round(ms / 1000)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute -inset-y-1 z-10 flex w-3.5 touch-none cursor-ew-resize items-center justify-center bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.7)] outline-none focus-visible:ring-2 focus-visible:ring-white",
        side === "start" ? "-translate-x-full rounded-l-md" : "rounded-r-md",
      )}
      style={{ left: `${leftPct}%` }}
    >
      <span className="h-5 w-0.5 rounded-full bg-neutral-950/60" />
    </button>
  );
}

function Nudger({
  label,
  ms,
  onMinus,
  onPlus,
  align = "start",
}: {
  label: string;
  ms: number;
  onMinus: () => void;
  onPlus: () => void;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("flex items-center gap-1", align === "end" && "justify-end")}>
      <button
        type="button"
        onClick={onMinus}
        aria-label={`${label} minus 1 second`}
        className="flex size-7 items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-14 text-center">
        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums">{formatClock(ms)}</span>
      </span>
      <button
        type="button"
        onClick={onPlus}
        aria-label={`${label} plus 1 second`}
        className="flex size-7 items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
