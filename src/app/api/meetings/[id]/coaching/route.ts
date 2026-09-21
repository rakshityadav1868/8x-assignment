import { computeCoachingMetrics } from "@/lib/analytics/coaching";
import type { CoachingResponse } from "@/lib/contracts";
import { requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/coaching — talk ratio, monologues, questions, fillers, interruptions, pace, patience. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const metrics = computeCoachingMetrics(await requireMeetingDetail(id));
  return Response.json({ metrics } satisfies CoachingResponse);
});
