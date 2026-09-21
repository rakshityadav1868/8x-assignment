/**
 * Per-call coaching metrics (Phase 5 C). Pure + isomorphic (no server-only imports) so the call page may
 * also compute it client-side from MeetingDetail. Owner: backend.
 */
import type { CoachingMetrics, FillerWordCount, MeetingDetail, SpeakerCoachingMetrics, TranscriptSegment } from "@/lib/types";

/** Single- and multi-word fillers, matched case-insensitively on word boundaries. */
export const FILLER_WORDS = ["um", "uh", "erm", "hmm", "like", "you know", "i mean", "sort of", "kind of", "basically", "actually", "literally"] as const;

/** Consecutive same-speaker segments separated by less than this are one monologue. */
export const MONOLOGUE_GAP_MS = 2000;
/** A turn that starts before the previous speaker's segment ended, or less than this after it, is an interruption. */
export const INTERRUPTION_OVERLAP_MS = 200;
/** Pauses longer than this are not counted toward patience (it was silence, not waiting). */
export const PATIENCE_MAX_GAP_MS = 5000;

const FILLER_RES: [string, RegExp][] = FILLER_WORDS.map((w) => [
  w,
  new RegExp(`(?<![\\p{L}\\p{N}'])${w.replace(/ /g, "[\\s,]+")}(?![\\p{L}\\p{N}'])`, "giu"),
]);

/** Previous turn was visibly cut off ("so we could-", "and then…"). */
const CUT_OFF_RE = /(?:[-–—]|\.\.\.|…)\s*$/;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Sentences ending in "?" (runs like "??" or "?!" count once). */
export function countQuestions(text: string): number {
  const m = text.match(/\?[?!]*/g);
  return m ? m.length : 0;
}

export function countFillers(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [word, re] of FILLER_RES) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m?.length) out.set(word, m.length);
  }
  return out;
}

interface Acc {
  talk_ms: number;
  segment_count: number;
  words: number;
  longest_monologue_ms: number;
  longest_monologue_start_ms: number | null;
  questions: number;
  fillers: Map<string, number>;
  interruptions: number;
  patience: number[];
}

const dur = (s: TranscriptSegment) => Math.max(0, s.end_ms - s.start_ms);

/**
 * Compute coaching metrics from segments:
 * - talk_ms/talk_pct per participant (sum of segment durations; pct of total talk)
 * - words, words_per_minute (words / talk minutes, 0 if no talk)
 * - longest_monologue_ms (+ start) merging same-speaker runs with gaps < MONOLOGUE_GAP_MS
 * - questions_asked: count of "?"-terminated sentences
 * - filler_words / filler_per_100_words / filler_breakdown (FILLER_WORDS)
 * - interruptions: speaker change where next.start_ms < prev.end_ms + INTERRUPTION_OVERLAP_MS (overlap or
 *   near-zero gap), or where the previous turn was visibly cut off (text ends with "-", "—", "…")
 * - avg_patience_ms: mean gap (0..PATIENCE_MAX_GAP_MS) before this speaker starts after a different speaker
 * - call totals, silence_ms (duration − union of speech), speaker_switches, internal/external talk pct.
 * Segments with participant_id null are ignored for per-speaker rows but count toward silence.
 * Speakers sorted by talk_ms desc. Participants with zero segments are omitted.
 */
export function computeCoachingMetrics(detail: Pick<MeetingDetail, "meeting" | "participants" | "segments">): CoachingMetrics {
  const segs = [...detail.segments].sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
  const byId = new Map(detail.participants.map((p) => [p.id, p]));
  const acc = new Map<string, Acc>();
  const get = (pid: string) => {
    let a = acc.get(pid);
    if (!a) {
      a = {
        talk_ms: 0,
        segment_count: 0,
        words: 0,
        longest_monologue_ms: 0,
        longest_monologue_start_ms: null,
        questions: 0,
        fillers: new Map(),
        interruptions: 0,
        patience: [],
      };
      acc.set(pid, a);
    }
    return a;
  };

  // Per-segment counts.
  for (const s of segs) {
    if (!s.participant_id || !byId.has(s.participant_id)) continue;
    const a = get(s.participant_id);
    a.talk_ms += dur(s);
    a.segment_count += 1;
    a.words += countWords(s.text);
    a.questions += countQuestions(s.text);
    for (const [w, n] of countFillers(s.text)) a.fillers.set(w, (a.fillers.get(w) ?? 0) + n);
  }

  // Turn-level metrics: monologues, switches, interruptions, patience.
  let speakerSwitches = 0;
  const allPatience: number[] = [];
  let run: { pid: string; start: number; end: number } | null = null;
  const closeRun = () => {
    if (!run) return;
    const a = get(run.pid);
    const len = run.end - run.start;
    if (len > a.longest_monologue_ms) {
      a.longest_monologue_ms = len;
      a.longest_monologue_start_ms = run.start;
    }
    run = null;
  };
  let prev: TranscriptSegment | null = null; // previous attributed segment
  for (const s of segs) {
    const pid = s.participant_id && byId.has(s.participant_id) ? s.participant_id : null;
    if (!pid) {
      closeRun();
      continue;
    }
    if (run && run.pid === pid && s.start_ms - run.end < MONOLOGUE_GAP_MS) {
      run.end = Math.max(run.end, s.end_ms);
    } else {
      closeRun();
      run = { pid, start: s.start_ms, end: s.end_ms };
    }
    if (prev && prev.participant_id !== pid) {
      speakerSwitches += 1;
      const gap = s.start_ms - prev.end_ms;
      const a = get(pid);
      if (gap < INTERRUPTION_OVERLAP_MS || CUT_OFF_RE.test(prev.text)) a.interruptions += 1;
      if (gap <= PATIENCE_MAX_GAP_MS) {
        const g = Math.max(0, gap);
        a.patience.push(g);
        allPatience.push(g);
      }
    }
    prev = s;
  }
  closeRun();

  // Union of speech (all segments, attributed or not) → silence.
  let union = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const s of segs) {
    if (s.start_ms > curEnd) {
      if (curEnd > curStart) union += curEnd - curStart;
      curStart = s.start_ms;
      curEnd = s.end_ms;
    } else curEnd = Math.max(curEnd, s.end_ms);
  }
  if (curEnd > curStart) union += curEnd - curStart;
  const lastEnd = segs.length ? Math.max(...segs.map((s) => s.end_ms)) : 0;
  const durationMs = Math.max(Math.round((detail.meeting.duration_sec || 0) * 1000), lastEnd);

  const totalTalk = [...acc.values()].reduce((n, a) => n + a.talk_ms, 0);
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

  const speakers: SpeakerCoachingMetrics[] = [...acc.entries()]
    .filter(([, a]) => a.segment_count > 0)
    .map(([pid, a]) => {
      const p = byId.get(pid)!;
      const fillerTotal = [...a.fillers.values()].reduce((n, x) => n + x, 0);
      const breakdown: FillerWordCount[] = [...a.fillers.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((x, y) => y.count - x.count || x.word.localeCompare(y.word));
      return {
        participant_id: pid,
        name: p.name,
        color: p.color,
        is_external: p.is_external,
        talk_ms: a.talk_ms,
        talk_pct: pct(a.talk_ms, totalTalk),
        segment_count: a.segment_count,
        words: a.words,
        words_per_minute: a.talk_ms > 0 ? Math.round(a.words / (a.talk_ms / 60000)) : 0,
        longest_monologue_ms: a.longest_monologue_ms,
        longest_monologue_start_ms: a.longest_monologue_start_ms,
        questions_asked: a.questions,
        filler_words: fillerTotal,
        filler_per_100_words: a.words > 0 ? round1((fillerTotal / a.words) * 100) : 0,
        filler_breakdown: breakdown,
        interruptions: a.interruptions,
        avg_patience_ms: mean(a.patience),
      };
    })
    .sort((x, y) => y.talk_ms - x.talk_ms || x.name.localeCompare(y.name));

  const externalTalk = speakers.filter((s) => s.is_external).reduce((n, s) => n + s.talk_ms, 0);
  return {
    meeting_id: detail.meeting.id,
    duration_ms: durationMs,
    total_talk_ms: totalTalk,
    silence_ms: Math.max(0, durationMs - union),
    speaker_switches: speakerSwitches,
    questions_asked: speakers.reduce((n, s) => n + s.questions_asked, 0),
    filler_words: speakers.reduce((n, s) => n + s.filler_words, 0),
    interruptions: speakers.reduce((n, s) => n + s.interruptions, 0),
    avg_patience_ms: mean(allPatience),
    internal_talk_pct: totalTalk > 0 ? round1(100 - pct(externalTalk, totalTalk)) : 0,
    external_talk_pct: pct(externalTalk, totalTalk),
    speakers,
  };
}
