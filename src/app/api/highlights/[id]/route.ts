import { TrimHighlightRequest, UpdateHighlightRequest, type HighlightResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** PATCH /api/highlights/:id */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateHighlightRequest);
  const repo = getRepo();
  const current = await repo.updateHighlight(id, {}); // throws 404 if missing
  const start = body.start_ms ?? current.start_ms;
  const end = body.end_ms ?? current.end_ms;
  if (body.start_ms !== undefined || body.end_ms !== undefined) {
    // Clip trim editor: end > start, ≤ 10 min, inside the recording.
    TrimHighlightRequest.parse({ start_ms: start, end_ms: end });
    const meeting = await repo.getMeeting(current.meeting_id);
    if (meeting?.duration_sec && end > meeting.duration_sec * 1000 + 1000) {
      throw new HttpError(400, "validation", "end_ms is past the end of the recording");
    }
  }
  const highlight = await repo.updateHighlight(id, body);
  return Response.json({ highlight } satisfies HighlightResponse);
});

/** DELETE /api/highlights/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteHighlight(id);
  return ok();
});
