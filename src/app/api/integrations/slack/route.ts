import { UpdateSlackConfigRequest, type SlackConfigResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { isSlackWebhookUrl, toSlackConfigView } from "@/lib/integrations/slack";
import { HttpError, parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/integrations/slack — config view (the webhook URL itself never leaves the server). */
export const GET = route(async () => {
  const config = await getRepo().getSlackConfig();
  return Response.json({ config: toSlackConfigView(config) } satisfies SlackConfigResponse);
});

/** PUT /api/integrations/slack — `webhook_url` must be https://hooks.slack.com/...; null disconnects. */
export const PUT = route(async (req: Request) => {
  const body = await parseBody(req, UpdateSlackConfigRequest);
  if (body.webhook_url && !isSlackWebhookUrl(body.webhook_url)) {
    throw new HttpError(400, "validation", "Must be a Slack incoming-webhook URL (https://hooks.slack.com/...)");
  }
  const config = await getRepo().saveSlackConfig(body);
  return Response.json({ config: toSlackConfigView(config) } satisfies SlackConfigResponse);
});
