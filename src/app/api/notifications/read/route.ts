import { MarkNotificationsReadRequest, type MarkNotificationsReadResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read — mark `ids` (or `all: true`) as read. */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, MarkNotificationsReadRequest);
  const unread_count = await getRepo().markNotificationsRead(body.all ? undefined : body.ids);
  return Response.json({ unread_count } satisfies MarkNotificationsReadResponse);
});
