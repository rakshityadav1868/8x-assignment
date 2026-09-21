/** Keyword trackers (Phase 5 C). Pure. Owner: backend. */
import type { MeetingDetail, Tracker, TrackerHit, TrackerWithStats } from "@/lib/types";

/**
 * Find every occurrence of any tracker keyword in segment text: case-insensitive, whole-word/phrase match
 * (punctuation-tolerant), one hit per (segment, keyword). Snippet = HTML-escaped segment text (trimmed to
 * ~200 chars around the match) with the match wrapped in <mark>. Ordered by meeting date desc, then start_ms.
 */
export function findTrackerHits(tracker: Tracker, details: MeetingDetail[]): TrackerHit[] {
  void tracker;
  void details;
  throw new Error("TODO");
}

/** Hits for all trackers inside one meeting, ordered by start_ms (call-page timeline markers). */
export function findMeetingTrackerHits(trackers: Tracker[], detail: MeetingDetail): TrackerHit[] {
  void trackers;
  void detail;
  throw new Error("TODO");
}

/** hit_count, meeting_count, last_hit_at for the tracker list. */
export function withTrackerStats(tracker: Tracker, hits: TrackerHit[]): TrackerWithStats {
  void tracker;
  void hits;
  throw new Error("TODO");
}
