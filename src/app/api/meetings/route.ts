import { getRepo } from "@/lib/db";
import type { ListMeetingsResponse } from "@/lib/contracts";
import { route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/meetings → { meetings (newest first), upcoming } */
export const GET = route(async () => {
  const repo = getRepo();
  const [meetings, upcoming] = await Promise.all([repo.listMeetings(), repo.listUpcoming()]);
  return Response.json({ meetings, upcoming } satisfies ListMeetingsResponse);
});
