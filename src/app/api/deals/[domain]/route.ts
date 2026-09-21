import { buildCompanyDetail } from "@/lib/analytics/deals";
import { UpdateDealRequest, type DealResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, parseBody, route } from "@/lib/server/api";
import { workspaceDomain } from "@/lib/server/events";

export const dynamic = "force-dynamic";

type DomainCtx = { params: Promise<{ domain: string }> };

async function load(domainParam: string) {
  const domain = decodeURIComponent(domainParam).trim().toLowerCase();
  const repo = getRepo();
  const [items, details, overrides, ws] = await Promise.all([
    repo.listMeetings(),
    repo.listMeetingDetails(),
    repo.getDealOverrides(domain),
    workspaceDomain(),
  ]);
  const company = buildCompanyDetail(domain, items, details, ws, overrides);
  if (!company) throw new NotFoundError("Company");
  return company;
}

/** GET /api/deals/:domain — company timeline, stakeholders, latest summary, next steps, BANT/MEDDPICC. */
export const GET = route(async (_req: Request, { params }: DomainCtx) => {
  const { domain } = await params;
  return Response.json({ company: await load(domain) } satisfies DealResponse);
});

/** PATCH /api/deals/:domain — save user overrides (merged over derived fields). */
export const PATCH = route(async (req: Request, { params }: DomainCtx) => {
  const { domain } = await params;
  const body = await parseBody(req, UpdateDealRequest);
  await load(domain); // 404 for unknown companies
  await getRepo().saveDealOverrides(decodeURIComponent(domain).trim().toLowerCase(), body);
  return Response.json({ company: await load(domain) } satisfies DealResponse);
});
