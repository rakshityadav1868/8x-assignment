import { CreateActionItemRequest, type ActionItemResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/action-items → { action_items } (convenience; also part of MeetingDetail). */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const detail = await requireMeetingDetail(id);
  return Response.json({ action_items: detail.action_items });
});

/** POST /api/meetings/:id/action-items — user-created (user_generated = true). */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CreateActionItemRequest);
  await requireMeetingDetail(id);
  const action_item = await getRepo().createActionItem(id, {
    description: body.description.trim(),
    assignee_participant_id: body.assignee_participant_id ?? null,
    timestamp_ms: body.timestamp_ms ?? null,
    completed: false,
    user_generated: true,
  });
  return Response.json({ action_item } satisfies ActionItemResponse, { status: 201 });
});
