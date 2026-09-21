import type { ListTeamResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/team — active members first, then invited; by name. */
export const GET = route(async () => {
  const members = await getRepo().listTeamMembers();
  return Response.json({ members } satisfies ListTeamResponse);
});
