import { UpdateHighlightRequest, type HighlightResponse } from "@/lib/contracts";
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
  if (end <= start) throw new HttpError(400, "validation", "end_ms must be after start_ms");
  const highlight = await repo.updateHighlight(id, body);
  return Response.json({ highlight } satisfies HighlightResponse);
});

/** DELETE /api/highlights/:id */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteHighlight(id);
  return ok();
});
