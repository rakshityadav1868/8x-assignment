import { UpdateActionItemRequest, type ActionItemResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** PATCH /api/action-items/:id — toggle completed / edit. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateActionItemRequest);
  const action_item = await getRepo().updateActionItem(id, body);
  return Response.json({ action_item } satisfies ActionItemResponse);
});

/** DELETE /api/action-items/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteActionItem(id);
  return ok();
});
