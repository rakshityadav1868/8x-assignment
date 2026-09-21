import { deriveDealFields, applyDealOverrides, primaryCompany } from "@/lib/analytics/deals";
import { CrmPreviewQuery, CrmSyncRequest, type CrmPreviewResponse, type CrmSyncResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { buildCrmPreview } from "@/lib/integrations/crm";
import { parseBody, parseQuery, requireMeetingDetail, route } from "@/lib/server/api";
import { workspaceDomain } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";
import { pickDefaultSummary } from "@/lib/server/summaries";
import type { CrmProvider } from "@/lib/types";

export const dynamic = "force-dynamic";

const PROVIDER_NAME: Record<CrmProvider, string> = { hubspot: "HubSpot", salesforce: "Salesforce" };

async function preview(id: string, provider: CrmProvider) {
  const repo = getRepo();
  const [detail, ws] = await Promise.all([requireMeetingDetail(id), workspaceDomain()]);
  const company = primaryCompany(detail.participants, ws);
  let fields = null;
  if (company) {
    // Deal fields across every call with this company (not just this one), plus the user's overrides.
    const all = await repo.listMeetingDetails().catch(() => [detail]);
    const related = all.filter((d) => primaryCompany(d.participants, ws)?.domain === company.domain);
    if (!related.some((d) => d.meeting.id === id)) related.push(detail);
    const overrides = await repo.getDealOverrides(company.domain).catch(() => null);
    fields = applyDealOverrides(deriveDealFields(related), overrides);
  }
  const summary = await pickDefaultSummary(detail);
  return buildCrmPreview(provider, detail, summary, fields, company?.domain ?? null);
}

/** GET /api/meetings/:id/crm?provider=hubspot — field-mapping preview (CRM OAuth is not connected). */
export const GET = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const q = parseQuery(req, CrmPreviewQuery);
  return Response.json({ preview: await preview(id, q.provider) } satisfies CrmPreviewResponse);
});

/** POST /api/meetings/:id/crm — "Sync": simulated, writes a CrmSyncLog (status "simulated"); nothing leaves Fanthom. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CrmSyncRequest);
  const fields = body.fields ?? (await preview(id, body.provider)).fields;
  const name = PROVIDER_NAME[body.provider];
  const log = await getRepo().addCrmSyncLog({
    meeting_id: id,
    provider: body.provider,
    status: "simulated",
    field_count: fields.length,
    fields,
    message: `Simulated sync: ${fields.length} field${fields.length === 1 ? "" : "s"} mapped for ${name}. ${name} isn't connected, so nothing was sent.`,
  });
  return Response.json({ log } satisfies CrmSyncResponse, { status: 201 });
});
