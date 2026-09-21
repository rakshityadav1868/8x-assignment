import type { SendToSlackResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { postToSlack } from "@/lib/integrations/slack";
import { HttpError, appOrigin, route } from "@/lib/server/api";
import { enforceActionLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/integrations/slack/test — REAL post of a short test message. 409 when Slack isn't connected. */
export const POST = route(async (req: Request) => {
  enforceActionLimit(req, "slack", { burst: 5, perMin: 5 });
  const config = await getRepo().getSlackConfig();
  if (!config.webhook_url) throw new HttpError(409, "conflict", "Connect Slack first: paste an incoming-webhook URL in Settings → Integrations.");
  const text = `:wave: Fanthom is connected${config.channel_label ? ` to ${config.channel_label}` : ""}. Meeting recaps will appear here. <${appOrigin(req)}/calls|Open Fanthom>`;
  const r = await postToSlack(config.webhook_url, { text });
  return Response.json({ ...r, preview_text: text } satisfies SendToSlackResponse);
});
