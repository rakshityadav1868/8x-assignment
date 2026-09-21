import { filterMeetings } from "@/lib/analytics/library";
import { ListMeetingsQuery, type ListMeetingsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseQuery, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings?scope&folder_id&q&meeting_type&participant&company&from&to&has_action_items&starred&trash&sort
 * → { meetings, upcoming, folders }. No params = all non-deleted meetings, newest first.
 */
export const GET = route(async (req: Request) => {
  const filters = parseQuery(req, ListMeetingsQuery);
  const repo = getRepo();
  const [all, upcoming, folders] = await Promise.all([
    repo.listMeetings({ include_deleted: !!filters.trash }),
    repo.listUpcoming(),
    repo.listFolders().catch(() => undefined), // optional until every repo implements folders
  ]);
  const meetings = filterMeetings(all, filters);
  return Response.json({ meetings, upcoming, ...(folders ? { folders } : {}) } satisfies ListMeetingsResponse);
});
