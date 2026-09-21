/**
 * Seed time shifting — shared by SeedRepo (runtime) and scripts/seed.mts (Supabase load).
 *
 * The seed JSON is static: every timestamp is written against a fixed canonical week in which the flagship
 * "Q4 Roadmap Planning" meeting happens on a Thursday at 10:00 ET (see `anchor` in workspace.json).
 * At load time everything is moved forward by a whole number of weeks so that meeting becomes the most recent
 * past occurrence of its weekday + time. Whole weeks keep every spoken weekday ("see you Thursday") true.
 * A small DST correction keeps ET wall-clock times stable across EDT/EST.
 *
 * Plain TS with no imports so Node can run it directly (type stripping) from scripts/seed.mts.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TZ = "America/New_York";

/** Keys holding ISO timestamps anywhere in seed records. */
const TIME_KEYS = new Set(["scheduled_start", "scheduled_end", "recording_start", "recording_end", "created_at", "start", "end"]);

/** UTC offset of `TZ` at `ms`, in minutes (e.g. -240 for EDT). */
function tzOffsetMin(ms: number): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(new Date(ms))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Whole weeks (plus DST correction) that move `startMs` to the same ET weekday/time `weeks` later. */
function weeksShift(startMs: number, weeks: number): number {
  const raw = weeks * WEEK_MS;
  return raw + (tzOffsetMin(startMs) - tzOffsetMin(startMs + raw)) * 60_000;
}

/**
 * Shift (ms) that makes the anchor meeting the most recent past occurrence of its ET weekday + time,
 * i.e. it has fully ended at `now`.
 */
export function pastWeekShift(anchorStartIso: string, anchorDurationMs: number, now = Date.now()): number {
  const start = Date.parse(anchorStartIso);
  let weeks = Math.floor((now - (start + anchorDurationMs)) / WEEK_MS);
  while (start + weeksShift(start, weeks) + anchorDurationMs > now) weeks--;
  while (start + weeksShift(start, weeks + 1) + anchorDurationMs <= now) weeks++;
  return weeksShift(start, weeks);
}

/** Shift (ms) that makes an event the next future occurrence of its ET weekday + time (for upcoming meetings). */
export function nextWeekShift(startIso: string, now = Date.now()): number {
  const start = Date.parse(startIso);
  let weeks = Math.floor((now - start) / WEEK_MS);
  while (start + weeksShift(start, weeks) <= now) weeks++;
  while (start + weeksShift(start, weeks - 1) > now) weeks--;
  return weeksShift(start, weeks);
}

/** Returns a deep copy of `value` with every known timestamp field moved by `shiftMs`. */
export function shiftTimestamps<T>(value: T, shiftMs: number): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        out[k] = TIME_KEYS.has(k) && typeof x === "string" && !Number.isNaN(Date.parse(x))
          ? new Date(Date.parse(x) + shiftMs).toISOString()
          : walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export interface SeedAnchor {
  meeting_id: string;
  recording_start: string;
  duration_ms: number;
}

/** Applies the runtime shift to the whole seed (meetings + workspace file). */
export function shiftSeed<M, W extends { upcoming: { start: string }[]; anchor?: SeedAnchor }>(
  meetings: M[],
  workspace: W,
  now = Date.now(),
): { meetings: M[]; workspace: W; shiftMs: number } {
  const anchor = workspace.anchor;
  if (!anchor) return { meetings, workspace, shiftMs: 0 };
  const shiftMs = pastWeekShift(anchor.recording_start, anchor.duration_ms, now);
  const { upcoming, ...rest } = workspace;
  const shiftedRest = shiftTimestamps(rest, shiftMs);
  const shiftedUpcoming = upcoming
    .map((u) => shiftTimestamps(u, nextWeekShift(u.start, now)))
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    meetings: meetings.map((m) => shiftTimestamps(m, shiftMs)),
    workspace: { ...shiftedRest, upcoming: shiftedUpcoming } as unknown as W,
    shiftMs,
  };
}
