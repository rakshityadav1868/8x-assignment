import { UpdateActionItemRequest, type ActionItemResponse } from "@/lib/contracts";
import { after } from "next/server";
import { getRepo } from "@/lib/db";
import { appOrigin, ok, parseBody, route } from "@/lib/server/api";
import { fireEvent } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** PATCH /api/action-items/:id — toggle completed / edit. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateActionItemRequest);
  const action_item = await getRepo().updateActionItem(id, body);
  if (body.completed === true) {
    const origin = appOrigin(req);
    after(() => fireEvent("action_item.completed", action_item.meeting_id, origin));
  }
  return Response.json({ action_item } satisfies ActionItemResponse);
});

/** DELETE /api/action-items/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteActionItem(id);
  return ok();
});
