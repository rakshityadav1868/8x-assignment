import { formatDuration } from "@/lib/ui/format";
import type { MeetingListItem } from "@/lib/types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeBars(id: string, palette: string[]) {
  let seed = hash(id);
  const out: { h: number; color: string; i: number }[] = [];
  for (let i = 0; i < 18; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    out.push({ h: 18 + (seed % 70), color: palette[(seed >> 8) % palette.length], i });
  }
  return out;
}

/** Deterministic "recording" thumbnail: speaker-colored waveform + duration overlay (no media decode). */
export function CallThumb({ meeting }: { meeting: Pick<MeetingListItem, "id" | "duration_sec" | "participants"> }) {
  const colors = meeting.participants.map((p) => p.color).filter(Boolean);
  const palette = colors.length ? colors : ["#3b82f6"];
  const bars = makeBars(meeting.id, palette);
  return (
    <div className="relative hidden h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-white/8 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(59,130,246,0.18),rgba(8,12,24,0.9))] sm:flex">
      <div className="flex h-full w-full items-center justify-center gap-[2px] px-2">
        {bars.map((b) => (
          <span
            key={b.i}
            className="w-[2px] rounded-full opacity-80"
            style={{ height: `${b.h}%`, backgroundColor: b.color }}
          />
        ))}
      </div>
      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[9px] tabular-nums text-white/85">
        {formatDuration(meeting.duration_sec)}
      </span>
    </div>
  );
}
