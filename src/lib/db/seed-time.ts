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
const TIME_KEYS = new Set([
  "scheduled_start",
  "scheduled_end",
  "recording_start",
  "recording_end",
  "created_at",
  "start",
  "end",
  // Phase 5
  "updated_at",
  "deleted_at",
  "invited_at",
  "joined_at",
  "read_at",
  "last_delivery_at",
  "close_date",
]);
/** Keys that record something that already happened: clamped to `now` after shifting (never in the future). */
const PAST_KEYS = new Set(["created_at", "updated_at", "invited_at", "joined_at", "read_at", "last_delivery_at"]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Returns a deep copy of `value` with every known timestamp field moved by `shiftMs`. Date-only values
 * ("2025-12-19") stay date-only. With `clampTo`, "already happened" fields (created_at, read_at, ...) are capped at it.
 */
export function shiftTimestamps<T>(value: T, shiftMs: number, clampTo?: number): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (TIME_KEYS.has(k) && typeof x === "string" && !Number.isNaN(Date.parse(x))) {
          if (DATE_ONLY.test(x)) {
            // whole days only (the DST correction must not move a calendar date)
            out[k] = new Date(Date.parse(x) + Math.round(shiftMs / 86_400_000) * 86_400_000).toISOString().slice(0, 10);
            continue;
          }
          let ms = Date.parse(x) + shiftMs;
          if (clampTo !== undefined && PAST_KEYS.has(k)) ms = Math.min(ms, clampTo);
          out[k] = new Date(ms).toISOString();
        } else out[k] = walk(x);
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

/**
 * Applies the runtime shift to the whole seed (meetings + workspace file + optional Phase 5 parity file).
 *
 * - meetings, playlists and parity data move by the same whole-week shift (the anchor becomes the latest Thursday);
 *   parity "already happened" times (comments, notifications, deliveries, ...) are additionally capped at `now`.
 * - calendar events (workspace.upcoming) each move to the next future occurrence of their ET weekday + time,
 *   keeping their canonical week relative to the anchor (week 1 → next 7 days, week 2+ → the 7 days after).
 */
export function shiftSeed<M, W extends { upcoming: { start: string }[]; anchor?: SeedAnchor }, P = undefined>(
  meetings: M[],
  workspace: W,
  now = Date.now(),
  parity?: P,
): { meetings: M[]; workspace: W; parity: P; shiftMs: number } {
  const anchor = workspace.anchor;
  if (!anchor) return { meetings, workspace, parity: parity as P, shiftMs: 0 };
  const shiftMs = pastWeekShift(anchor.recording_start, anchor.duration_ms, now);
  const { upcoming, ...rest } = workspace;
  const shiftedRest = shiftTimestamps(rest, shiftMs);
  const anchorStart = Date.parse(anchor.recording_start);
  const shiftedUpcoming = upcoming
    .map((u) => {
      const start = Date.parse(u.start);
      const base = nextWeekShift(u.start, now);
      const week = Math.min(1, Math.max(0, Math.floor((start - anchorStart) / WEEK_MS))); // two-week calendar
      return shiftTimestamps(u, base + weeksShift(start + base, week));
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    meetings: meetings.map((m) => shiftTimestamps(m, shiftMs)),
    workspace: { ...shiftedRest, upcoming: shiftedUpcoming } as unknown as W,
    parity: parity === undefined ? (parity as P) : shiftTimestamps(parity, shiftMs, now - 60_000),
    shiftMs,
  };
}
