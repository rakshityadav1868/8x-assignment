import { UpdateSegmentRequest, type UpdateSegmentResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** PATCH /api/segments/:id — transcript edit / reassign speaker (P3). */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateSegmentRequest);
  const segment = await getRepo().updateSegment(id, body);
  return Response.json({ segment } satisfies UpdateSegmentResponse);
});
