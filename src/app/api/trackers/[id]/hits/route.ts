import { findTrackerHits, withTrackerStats } from "@/lib/analytics/trackers";
import { TrackerHitsQuery, type TrackerHitsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, parseQuery, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/trackers/:id/hits?meeting_id=&limit= — newest meeting first, then start_ms. */
export const GET = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const q = parseQuery(req, TrackerHitsQuery);
  const repo = getRepo();
  const tracker = await repo.getTracker(id);
  if (!tracker) throw new NotFoundError("Tracker");
  const details = await repo.listMeetingDetails(q.meeting_id ? { ids: [q.meeting_id] } : undefined);
  const all = findTrackerHits(tracker, details);

  const byMeeting = new Map<string, TrackerHitsResponse["by_meeting"][number]>();
  const byKeyword = new Map<string, number>();
  for (const h of all) {
    const m = byMeeting.get(h.meeting_id) ?? { meeting_id: h.meeting_id, meeting_title: h.meeting_title, meeting_date: h.meeting_date, hits: 0 };
    m.hits += 1;
    byMeeting.set(h.meeting_id, m);
    const k = h.keyword.toLowerCase();
    byKeyword.set(k, (byKeyword.get(k) ?? 0) + 1);
  }
  const keywordLabel = new Map(tracker.keywords.map((k) => [k.toLowerCase(), k]));
  return Response.json({
    tracker: withTrackerStats(tracker, all),
    hits: all.slice(0, q.limit),
    by_meeting: [...byMeeting.values()],
    by_keyword: [...byKeyword.entries()]
      .map(([k, hits]) => ({ keyword: keywordLabel.get(k) ?? k, hits }))
      .sort((a, b) => b.hits - a.hits || a.keyword.localeCompare(b.keyword)),
  } satisfies TrackerHitsResponse);
});
