"use client";

import { useRef, useState } from "react";
import { Captions, CaptionsOff, Pause, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLAYBACK_RATES, usePlayer, usePlayerStore } from "@/hooks/use-player";
import { formatClock } from "@/lib/ui/format";
import type { Chapter, Highlight } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_META } from "@/components/common/bits";

function IconBtn({
  label,
  shortcut,
  onClick,
  children,
  className,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <kbd className="ml-2 rounded bg-white/10 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function Scrubber({
  chapters = [],
  highlights = [],
  bounds,
}: {
  chapters?: Chapter[];
  highlights?: Highlight[];
  bounds?: { startMs: number; endMs: number };
}) {
  const store = usePlayerStore();
  const currentMs = usePlayer((s) => s.currentMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const lo = bounds?.startMs ?? 0;
  const hi = bounds?.endMs ?? durationMs;
  const span = Math.max(1, hi - lo);
  const pct = Math.max(0, Math.min(1, (currentMs - lo) / span));

  const msAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return { ms: lo + f * span, x: f * r.width };
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(span / 1000)}
      aria-valuenow={Math.round((currentMs - lo) / 1000)}
      aria-valuetext={formatClock(currentMs)}
      className="group/scrub relative flex h-5 cursor-pointer touch-none items-center outline-none"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        store.seek(msAt(e.clientX).ms);
      }}
      onPointerMove={(e) => {
        const p = msAt(e.clientX);
        setHover(p);
        if (dragging) store.seek(p.ms);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          store.skip(5000);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          store.skip(-5000);
        }
      }}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/12 transition-[height] group-hover/scrub:h-1.5">
        {/* chapter gaps */}
        {chapters.slice(1).map((c) => (
          <span
            key={c.id}
            className="absolute inset-y-0 z-10 w-[2px] bg-[#060a14]"
            style={{ left: `${((c.start_ms - lo) / span) * 100}%` }}
          />
        ))}
        {hover && (
          <div className="absolute inset-y-0 left-0 bg-white/15" style={{ width: hover.x }} />
        )}
        <div
          className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-blue-500 to-sky-400"
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
      {highlights.map((h) => (
        <span
          key={h.id}
          className="pointer-events-none absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-[9px] rounded-full"
          style={{ left: `${((h.start_ms - lo) / span) * 100}%`, backgroundColor: HIGHLIGHT_META[h.type].color }}
        />
      ))}
      <span
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_12px_rgba(96,165,250,0.9)] transition-opacity group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100"
        style={{ left: `${pct * 100}%` }}
      />
      {hover && (
        <span
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white"
          style={{ left: hover.x }}
        >
          {formatClock(hover.ms)}
          {(() => {
            const c = [...chapters].reverse().find((ch) => ch.start_ms <= hover.ms);
            return c ? <span className="ml-1.5 font-sans text-white/60">{c.title}</span> : null;
          })()}
        </span>
      )}
    </div>
  );
}

export function PlayerControls({
  chapters,
  highlights,
  captions,
  onToggleCaptions,
  bounds,
  className,
}: {
  chapters?: Chapter[];
  highlights?: Highlight[];
  captions?: boolean;
  onToggleCaptions?: () => void;
  bounds?: { startMs: number; endMs: number };
  className?: string;
}) {
  const store = usePlayerStore();
  const playing = usePlayer((s) => s.playing);
  const sec = usePlayer((s) => Math.floor(s.currentMs / 1000));
  const durationMs = usePlayer((s) => s.durationMs);
  const rate = usePlayer((s) => s.rate);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const virtual = usePlayer((s) => s.virtual);
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const lo = bounds?.startMs ?? 0;
  const hi = bounds?.endMs ?? durationMs;

  return (
    <div className={cn("rounded-2xl border border-white/8 bg-white/[0.03] px-3 pb-2 pt-2.5", className)}>
      <Scrubber chapters={chapters} highlights={highlights} bounds={bounds} />
      <div className="mt-1 flex items-center gap-0.5">
        <IconBtn label={playing ? "Pause" : "Play"} shortcut="Space" onClick={store.toggle} className="size-9">
          {playing ? <Pause className="size-[18px] fill-current" /> : <Play className="ml-0.5 size-[18px] fill-current" />}
        </IconBtn>
        <IconBtn label="Back 10s" shortcut="J" onClick={() => store.skip(-10_000)}>
          <RotateCcw className="size-4" />
        </IconBtn>
        <IconBtn label="Forward 10s" shortcut="L" onClick={() => store.skip(10_000)}>
          <RotateCw className="size-4" />
        </IconBtn>
        <span className="ml-1.5 font-mono text-xs tabular-nums text-white/80">
          {formatClock(sec * 1000 - lo)}
          <span className="text-white/35"> / {formatClock(hi - lo)}</span>
        </span>
        {virtual && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-2 hidden cursor-help rounded-full border border-white/10 px-1.5 text-[10px] text-muted-foreground sm:inline">
                Preview clock
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-56">
              No playable media for this call, so playback is simulated — transcript sync, seeking and speed all still work.
            </TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {onToggleCaptions && (
            <IconBtn label={captions ? "Hide captions" : "Show captions"} onClick={onToggleCaptions}>
              {captions ? <Captions className="size-4" /> : <CaptionsOff className="size-4" />}
            </IconBtn>
          )}
          <div className="group/vol hidden items-center sm:flex">
            <IconBtn label={muted ? "Unmute" : "Mute"} onClick={store.toggleMute}>
              <VolIcon className="size-4" />
            </IconBtn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => store.setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer accent-sky-400 opacity-0 transition-all group-hover/vol:w-16 group-hover/vol:opacity-100 focus:w-16 focus:opacity-100"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Playback speed"
                className="inline-flex h-7 min-w-11 items-center justify-center rounded-full border border-white/10 px-2 font-mono text-[11px] font-medium tabular-nums text-white/85 hover:bg-white/10"
              >
                {rate}×
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Speed · Shift + &lt; / &gt;</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(rate)} onValueChange={(v) => store.setRate(Number(v))}>
                {PLAYBACK_RATES.map((r) => (
                  <DropdownMenuRadioItem key={r} value={String(r)}>
                    {r}×{r === 1 && <span className="ml-auto text-xs text-muted-foreground">Normal</span>}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
