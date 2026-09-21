import { ListNotificationsQuery, type ListNotificationsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseQuery, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/notifications?unread=true&limit= — newest first, plus the unread count for the bell. */
export const GET = route(async (req: Request) => {
  const q = parseQuery(req, ListNotificationsQuery);
  const result = await getRepo().listNotifications({ unread: q.unread, limit: q.limit });
  return Response.json(result satisfies ListNotificationsResponse);
});
