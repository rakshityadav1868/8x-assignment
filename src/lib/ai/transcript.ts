import type { Chapter, MeetingDetail, Participant, TranscriptSegment } from "@/lib/types";

/** mm:ss (or h:mm:ss for calls over an hour). */
export function fmtTs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function speakerMap(participants: Participant[]): Map<string, Participant> {
  return new Map(participants.map((p) => [p.id, p]));
}

export function speakerName(seg: TranscriptSegment, people: Map<string, Participant>): string {
  return (seg.participant_id && people.get(seg.participant_id)?.name) || "Unknown speaker";
}

export interface FormatOptions {
  from_ms?: number;
  to_ms?: number;
  /** Prefix each line with a citation ref `#n` (n = index into the returned `refs`). */
  withRefs?: boolean;
}

/**
 * Formats segments as `[mm:ss] Speaker: text` lines (spec format). With `withRefs`, lines become
 * `#12 [mm:ss] Speaker: text` and `refs[12]` is the segment — used to resolve Ask citations.
 */
export function formatTranscript(
  detail: Pick<MeetingDetail, "segments" | "participants">,
  opts: FormatOptions = {},
): { text: string; refs: TranscriptSegment[] } {
  const people = speakerMap(detail.participants);
  const from = opts.from_ms ?? 0;
  const to = opts.to_ms ?? Infinity;
  const refs: TranscriptSegment[] = [];
  const lines: string[] = [];
  for (const s of detail.segments) {
    if (s.end_ms <= from || s.start_ms >= to) continue;
    const ref = opts.withRefs ? `#${refs.length} ` : "";
    refs.push(s);
    lines.push(`${ref}[${fmtTs(s.start_ms)}] ${speakerName(s, people)}: ${s.text.trim()}`);
  }
  return { text: lines.join("\n"), refs };
}

export function participantList(detail: Pick<MeetingDetail, "participants">): string {
  return detail.participants.map((p) => `- ${p.name}${p.is_external ? " (external)" : ""}${p.email ? ` <${p.email}>` : ""}`).join("\n");
}

/** Snap a model-provided offset to the start of the closest segment (models round timestamps). */
export function snapToSegment(ms: number, segments: TranscriptSegment[]): number {
  if (!segments.length) return Math.max(0, Math.round(ms));
  let best = segments[0];
  let bestD = Infinity;
  for (const s of segments) {
    const d = ms >= s.start_ms && ms < s.end_ms ? 0 : Math.abs(s.start_ms - ms);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
    if (s.start_ms > ms + 60_000) break;
  }
  return best.start_ms;
}

/** Case-insensitive name → participant id (full name, first name, or "Speaker N"). */
export function matchParticipant(name: string | null | undefined, participants: Participant[]): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const exact = participants.find((p) => p.name.toLowerCase() === n);
  if (exact) return exact.id;
  const first = participants.find((p) => p.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
  if (first) return first.id;
  const partial = participants.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
  return partial?.id ?? null;
}

export function meetingEndMs(detail: Pick<MeetingDetail, "meeting" | "segments">): number {
  const last = detail.segments[detail.segments.length - 1];
  return Math.max(detail.meeting.duration_sec * 1000, last?.end_ms ?? 0);
}

/**
 * Chunks for map-reduce: by chapter when available, else ~10-minute windows (cut on segment boundaries).
 */
export function chunkForMapReduce(
  detail: Pick<MeetingDetail, "segments" | "chapters">,
  windowMs = 10 * 60_000,
): { title: string | null; from_ms: number; to_ms: number }[] {
  const chapters: Pick<Chapter, "title" | "start_ms" | "end_ms">[] = detail.chapters;
  if (chapters.length >= 2) return chapters.map((c) => ({ title: c.title, from_ms: c.start_ms, to_ms: c.end_ms }));
  const out: { title: string | null; from_ms: number; to_ms: number }[] = [];
  let start = 0;
  for (const s of detail.segments) {
    if (s.start_ms - start >= windowMs) {
      out.push({ title: null, from_ms: start, to_ms: s.start_ms });
      start = s.start_ms;
    }
  }
  out.push({ title: null, from_ms: start, to_ms: Infinity });
  return out;
}

/** Transcripts longer than this are summarised map-reduce by chapter. */
export const LONG_MEETING_MS = 25 * 60_000;
