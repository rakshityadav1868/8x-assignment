import { computeInsights } from "@/lib/analytics/insights";
import { InsightsQuery, type InsightsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseQuery, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/insights?range=30d&internal_only=true — team dashboard across calls in range. */
export const GET = route(async (req: Request) => {
  const q = parseQuery(req, InsightsQuery);
  const repo = getRepo();
  const [details, session, trackers] = await Promise.all([repo.listMeetingDetails(), repo.getCurrentSession(), repo.listTrackers()]);
  const insights = computeInsights(details, {
    range: q.range,
    now: new Date(),
    me: session.user,
    workspace_domain: session.workspace.domain,
    trackers,
    internal_only: q.internal_only,
  });
  return Response.json(insights satisfies InsightsResponse);
});
