import "server-only";
import { findTrackerHits, withTrackerStats } from "@/lib/analytics/trackers";
import type { TrackerHitsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";

/** Server-side twin of GET /api/trackers/:id/hits (limit 1000) so the page paints complete; null = unknown id. */
export async function loadTrackerHits(id: string): Promise<TrackerHitsResponse | null> {
  const repo = getRepo();
  const tracker = await repo.getTracker(id);
  if (!tracker) return null;
  const all = findTrackerHits(tracker, await repo.listMeetingDetails());
  const byMeeting = new Map<string, TrackerHitsResponse["by_meeting"][number]>();
  const byKeyword = new Map<string, number>();
  for (const h of all) {
    const m = byMeeting.get(h.meeting_id) ?? { meeting_id: h.meeting_id, meeting_title: h.meeting_title, meeting_date: h.meeting_date, hits: 0 };
    m.hits += 1;
    byMeeting.set(h.meeting_id, m);
    const k = h.keyword.toLowerCase();
    byKeyword.set(k, (byKeyword.get(k) ?? 0) + 1);
  }
  const label = new Map(tracker.keywords.map((k) => [k.toLowerCase(), k]));
  return {
    tracker: withTrackerStats(tracker, all),
    hits: all.slice(0, 1000),
    by_meeting: [...byMeeting.values()],
    by_keyword: [...byKeyword.entries()]
      .map(([k, hits]) => ({ keyword: label.get(k) ?? k, hits }))
      .sort((a, b) => b.hits - a.hits || a.keyword.localeCompare(b.keyword)),
  };
}
