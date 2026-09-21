import { SendToSlackRequest, type SendToSlackResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { buildSlackRecap, postToSlack } from "@/lib/integrations/slack";
import { HttpError, appOrigin, parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import { enforceActionLimit } from "@/lib/server/rate-limit";
import type { IdCtx } from "@/lib/server/route-types";
import { pickDefaultSummary } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

/** POST /api/meetings/:id/slack — REAL post of the meeting recap (Block Kit) to the configured Slack webhook. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, SendToSlackRequest);
  enforceActionLimit(req, "slack", { burst: 5, perMin: 5 });
  const [detail, config] = await Promise.all([requireMeetingDetail(id), getRepo().getSlackConfig()]);
  if (!config.webhook_url) throw new HttpError(409, "conflict", "Connect Slack first: paste an incoming-webhook URL in Settings → Integrations.");
  const summary = await pickDefaultSummary(detail, { template: body.template ?? null });
  const msg = buildSlackRecap(detail, summary, config, { origin: appOrigin(req), note: body.note });
  const r = await postToSlack(config.webhook_url, msg);
  return Response.json({ ...r, preview_text: msg.text } satisfies SendToSlackResponse);
});
