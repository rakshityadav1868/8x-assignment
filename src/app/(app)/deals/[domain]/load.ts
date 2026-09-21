import "server-only";
import { buildCompanyDetail } from "@/lib/analytics/deals";
import { getRepo } from "@/lib/db";
import { workspaceDomain } from "@/lib/server/events";
import type { CompanyDetail } from "@/lib/types";

/** Server-side twin of GET /api/deals/:domain; null = no external calls with that domain. */
export async function loadDeal(domainParam: string): Promise<CompanyDetail | null> {
  const domain = decodeURIComponent(domainParam).trim().toLowerCase();
  const repo = getRepo();
  const [items, details, overrides, ws] = await Promise.all([
    repo.listMeetings(),
    repo.listMeetingDetails(),
    repo.getDealOverrides(domain),
    workspaceDomain(),
  ]);
  return buildCompanyDetail(domain, items, details, ws, overrides) ?? null;
}
