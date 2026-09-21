import type { ListWebhookDeliveriesResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/integrations/webhooks/:id/deliveries — newest first, max 50. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const repo = getRepo();
  if (!(await repo.getWebhook(id))) throw new NotFoundError("Webhook");
  const deliveries = await repo.listWebhookDeliveries(id, 50);
  return Response.json({ deliveries } satisfies ListWebhookDeliveriesResponse);
});
