import { findTrackerHits, withTrackerStats } from "@/lib/analytics/trackers";
import { UpdateTrackerRequest, type TrackerResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/trackers/:id */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const repo = getRepo();
  const tracker = await repo.getTracker(id);
  if (!tracker) throw new NotFoundError("Tracker");
  const details = await repo.listMeetingDetails();
  return Response.json({ tracker: withTrackerStats(tracker, findTrackerHits(tracker, details)) } satisfies TrackerResponse);
});

/** PATCH /api/trackers/:id */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateTrackerRequest);
  const repo = getRepo();
  const patch = { ...body, ...(body.keywords ? { keywords: Array.from(new Set(body.keywords.map((k) => k.trim()).filter(Boolean))) } : {}) };
  const tracker = await repo.updateTracker(id, patch);
  const details = await repo.listMeetingDetails();
  return Response.json({ tracker: withTrackerStats(tracker, findTrackerHits(tracker, details)) } satisfies TrackerResponse);
});

/** DELETE /api/trackers/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteTracker(id);
  return ok();
});
