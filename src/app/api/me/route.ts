import type { MeResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/me — current user, workspace, member row and auth mode ("demo" → "Demo workspace" badge). */
export const GET = route(async () => {
  const session = await getRepo().getCurrentSession();
  return Response.json(session satisfies MeResponse);
});
