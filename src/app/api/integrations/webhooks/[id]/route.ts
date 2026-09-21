import { UpdateWebhookRequest, type WebhookResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { validateWebhookUrl } from "@/lib/integrations/webhooks";
import { HttpError, NotFoundError, ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/integrations/webhooks/:id */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const webhook = await getRepo().getWebhook(id);
  if (!webhook) throw new NotFoundError("Webhook");
  return Response.json({ webhook } satisfies WebhookResponse);
});

/** PATCH /api/integrations/webhooks/:id — edit / pause / rotate secret. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateWebhookRequest);
  if (body.url !== undefined) {
    const invalid = validateWebhookUrl(body.url);
    if (invalid) throw new HttpError(400, "validation", invalid);
  }
  const webhook = await getRepo().updateWebhook(id, {
    ...body,
    ...(body.url !== undefined ? { url: body.url.trim() } : {}),
    ...(body.events ? { events: Array.from(new Set(body.events)) } : {}),
  });
  return Response.json({ webhook } satisfies WebhookResponse);
});

/** DELETE /api/integrations/webhooks/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteWebhook(id);
  return ok();
});
