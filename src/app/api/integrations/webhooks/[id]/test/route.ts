import { TestWebhookRequest, type WebhookDeliveryResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { buildWebhookPayload, deliverWebhook } from "@/lib/integrations/webhooks";
import { HttpError, NotFoundError, appOrigin, parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import { newId } from "@/lib/server/ids";
import { enforceActionLimit } from "@/lib/server/rate-limit";
import type { IdCtx } from "@/lib/server/route-types";
import { pickDefaultSummary } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/webhooks/:id/test — REAL signed POST of a sample `meeting.ready` payload
 * (latest ready meeting unless `meeting_id`). Rate limited per IP. The delivery is recorded either way.
 */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, TestWebhookRequest);
  enforceActionLimit(req, "webhook-test", { burst: 5, perMin: 5 });
  const repo = getRepo();
  const webhook = await repo.getWebhook(id);
  if (!webhook) throw new NotFoundError("Webhook");

  let meetingId = body.meeting_id;
  if (!meetingId) {
    const latest = (await repo.listMeetings()).find((m) => m.status === "ready" && !m.deleted_at);
    if (!latest) throw new HttpError(409, "conflict", "There is no ready meeting to send as a sample yet.");
    meetingId = latest.id;
  }
  const detail = await requireMeetingDetail(meetingId);
  const summary = await pickDefaultSummary(detail);
  const payload = buildWebhookPayload("meeting.ready", detail, summary, { origin: appOrigin(req), deliveryId: newId("whd"), test: true });
  const delivery = await repo.recordWebhookDelivery(await deliverWebhook(webhook, payload));
  return Response.json({ delivery } satisfies WebhookDeliveryResponse);
});
