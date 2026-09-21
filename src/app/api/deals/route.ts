import { groupCompanies } from "@/lib/analytics/deals";
import type { ListDealsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { route } from "@/lib/server/api";
import { workspaceDomain } from "@/lib/server/events";

export const dynamic = "force-dynamic";

/** GET /api/deals — companies (external email domains) from calls, most recent activity first. */
export const GET = route(async () => {
  const repo = getRepo();
  const [items, details, overrides, domain] = await Promise.all([
    repo.listMeetings(),
    repo.listMeetingDetails(),
    repo.listDealOverrides(),
    workspaceDomain(),
  ]);
  return Response.json({ companies: groupCompanies(items, details, domain, overrides) } satisfies ListDealsResponse);
});
