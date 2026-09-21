import { UpdateCalendarEventRequest, type CalendarEventResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

type EventCtx = { params: Promise<{ eventId: string }> };

/** PATCH /api/calendar/:eventId — per-event Record toggle (null = follow the auto-record rule). */
export const PATCH = route(async (req: Request, { params }: EventCtx) => {
  const { eventId } = await params;
  const body = await parseBody(req, UpdateCalendarEventRequest);
  const event = await getRepo().setCalendarRecord(decodeURIComponent(eventId), body.record);
  return Response.json({ event } satisfies CalendarEventResponse);
});
