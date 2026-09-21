import { EmailRecapRequest, ROUTES, type EmailRecapResponse } from "@/lib/contracts";
import { buildEmailRecap } from "@/lib/export/summary";
import { appOrigin, parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { pickDefaultSummary } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

/** POST /api/meetings/:id/email-recap — preview only (no mail provider; never sent). */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, EmailRecapRequest);
  const detail = await requireMeetingDetail(id);
  const summary = await pickDefaultSummary(detail, { template: body.template ?? null });
  const recap = buildEmailRecap(detail, summary, {
    callUrl: `${appOrigin(req)}${ROUTES.pages.call(id)}`,
    include_action_items: body.include_action_items,
    include_highlights: body.include_highlights,
    recipients: body.recipients,
  });
  return Response.json({ recap } satisfies EmailRecapResponse);
});
