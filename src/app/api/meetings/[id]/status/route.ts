import type { StatusResponse } from "@/lib/contracts";
import { requireMeeting, route } from "@/lib/server/api";
import { statusOf } from "@/lib/server/pipeline";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/status — poll every ~2s until stage is ready | failed. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  return Response.json(statusOf(await requireMeeting(id)) satisfies StatusResponse);
});
