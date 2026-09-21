import { findTrackerHits, withTrackerStats } from "@/lib/analytics/trackers";
import { CreateTrackerRequest, type ListTrackersResponse, type TrackerResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/trackers — trackers with hit/meeting counts across all ready calls. */
export const GET = route(async () => {
  const repo = getRepo();
  const [trackers, details] = await Promise.all([repo.listTrackers(), repo.listMeetingDetails()]);
  return Response.json({
    trackers: trackers.map((t) => withTrackerStats(t, findTrackerHits(t, details))),
  } satisfies ListTrackersResponse);
});

/** POST /api/trackers */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, CreateTrackerRequest);
  const repo = getRepo();
  const keywords = Array.from(new Set(body.keywords.map((k) => k.trim()).filter(Boolean)));
  const tracker = await repo.createTracker({ name: body.name, description: body.description ?? null, keywords, color: body.color });
  const details = await repo.listMeetingDetails();
  return Response.json({ tracker: withTrackerStats(tracker, findTrackerHits(tracker, details)) } satisfies TrackerResponse, { status: 201 });
});
