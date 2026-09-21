import { findMeetingTrackerHits } from "@/lib/analytics/trackers";
import type { MeetingTrackerHitsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/trackers — every tracker's hits inside this call (timeline markers). */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const [detail, trackers] = await Promise.all([requireMeetingDetail(id), getRepo().listTrackers()]);
  const hits = findMeetingTrackerHits(trackers, detail);
  return Response.json({ trackers, hits } satisfies MeetingTrackerHitsResponse);
});
