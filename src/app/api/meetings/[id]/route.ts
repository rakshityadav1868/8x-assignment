import { getRepo } from "@/lib/db";
import { UpdateMeetingRequest, type GetMeetingResponse, type UpdateMeetingResponse } from "@/lib/contracts";
import { parseBody, requireMeeting, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id → MeetingDetail */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  return Response.json((await requireMeetingDetail(id)) satisfies GetMeetingResponse);
});

/** PATCH /api/meetings/:id — rename / change meeting type badge. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateMeetingRequest);
  await requireMeeting(id);
  const meeting = await getRepo().updateMeeting(id, body);
  return Response.json({ meeting } satisfies UpdateMeetingResponse);
});
