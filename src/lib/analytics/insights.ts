/** Team insights dashboard (Phase 5 C). Pure. Owner: backend. */
import type { InsightsRange, InsightsSummary, MeetingDetail, Tracker, User } from "@/lib/types";

export interface InsightsContext {
  range: InsightsRange;
  now: Date;
  me: User; // for weekly.avg_talk_pct_me
  workspace_domain: string; // internal = email domain matches
  trackers: Tracker[]; // for top_trackers (uses analytics/trackers.ts)
  internal_only?: boolean;
}

/**
 * Aggregate across ready, non-deleted meetings whose date (recording_start ?? scheduled_start ?? created_at)
 * falls in range. Uses computeCoachingMetrics per meeting; persons are keyed by lowercased email (else name).
 * weekly buckets start Monday (UTC), oldest first, including empty weeks within range ("all" = since first meeting).
 * meeting_load counts meeting starts by (UTC weekday Mon=0, hour). top_trackers: top 5 by hits.
 */
export function computeInsights(details: MeetingDetail[], ctx: InsightsContext): InsightsSummary {
  void details;
  void ctx;
  throw new Error("TODO");
}

/** Range start for a range key (null for "all"). */
export function rangeStart(range: InsightsRange, now: Date): Date | null {
  void range;
  void now;
  throw new Error("TODO");
}
