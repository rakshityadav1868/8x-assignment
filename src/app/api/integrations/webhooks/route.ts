import { CreateWebhookRequest, type ListWebhooksResponse, type WebhookResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { validateWebhookUrl } from "@/lib/integrations/webhooks";
import { HttpError, parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/integrations/webhooks */
export const GET = route(async () => {
  const webhooks = await getRepo().listWebhooks();
  return Response.json({ webhooks } satisfies ListWebhooksResponse);
});

/** POST /api/integrations/webhooks — https only, public hosts only (SSRF guard); server generates the secret. */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, CreateWebhookRequest);
  const invalid = validateWebhookUrl(body.url);
  if (invalid) throw new HttpError(400, "validation", invalid);
  const webhook = await getRepo().createWebhook({
    url: body.url.trim(),
    description: body.description ?? null,
    events: Array.from(new Set(body.events)),
    active: body.active,
  });
  return Response.json({ webhook } satisfies WebhookResponse, { status: 201 });
});
