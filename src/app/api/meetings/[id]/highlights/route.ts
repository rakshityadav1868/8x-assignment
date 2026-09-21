import { CreateHighlightRequest, type HighlightResponse, type ListHighlightsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, requireMeeting, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/highlights */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  return Response.json({ highlights: await getRepo().listHighlights(id) } satisfies ListHighlightsResponse);
});

/** POST /api/meetings/:id/highlights — user-created clip; server generates share_token. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CreateHighlightRequest);
  await requireMeeting(id);
  const highlight = await getRepo().createHighlight(id, {
    start_ms: body.start_ms,
    end_ms: body.end_ms,
    type: body.type,
    title: body.title,
    note: body.note ?? null,
    user_generated: true,
  });
  return Response.json({ highlight } satisfies HighlightResponse, { status: 201 });
});
