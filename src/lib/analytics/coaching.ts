/**
 * Per-call coaching metrics (Phase 5 C). Pure + isomorphic (no server-only imports) so the call page may
 * also compute it client-side from MeetingDetail. Owner: backend.
 */
import type { CoachingMetrics, MeetingDetail } from "@/lib/types";

/** Single- and multi-word fillers, matched case-insensitively on word boundaries. */
export const FILLER_WORDS = ["um", "uh", "erm", "hmm", "like", "you know", "i mean", "sort of", "kind of", "basically", "actually", "literally"] as const;

/** Consecutive same-speaker segments separated by less than this are one monologue. */
export const MONOLOGUE_GAP_MS = 2000;
/** A turn that starts before the previous speaker's segment ended (by more than this) is an interruption. */
export const INTERRUPTION_OVERLAP_MS = 200;
/** Pauses longer than this are not counted toward patience (it was silence, not waiting). */
export const PATIENCE_MAX_GAP_MS = 5000;

/**
 * Compute coaching metrics from segments:
 * - talk_ms/talk_pct per participant (sum of segment durations; pct of total talk)
 * - words, words_per_minute (words / talk minutes, 0 if no talk)
 * - longest_monologue_ms (+ start) merging same-speaker runs with gaps < MONOLOGUE_GAP_MS
 * - questions_asked: count of "?"-terminated sentences
 * - filler_words / filler_per_100_words / filler_breakdown (FILLER_WORDS)
 * - interruptions: speaker change where next.start_ms < prev.end_ms - INTERRUPTION_OVERLAP_MS
 * - avg_patience_ms: mean gap (0..PATIENCE_MAX_GAP_MS) before this speaker starts after a different speaker
 * - call totals, silence_ms (duration − union of speech), speaker_switches, internal/external talk pct.
 * Segments with participant_id null are ignored for per-speaker rows but count toward silence.
 * Speakers sorted by talk_ms desc. Participants with zero segments are omitted.
 */
export function computeCoachingMetrics(detail: Pick<MeetingDetail, "meeting" | "participants" | "segments">): CoachingMetrics {
  void detail;
  throw new Error("TODO");
}
