import { getRepo } from "@/lib/db";
import { UpdateMeetingRequest, type GetMeetingResponse, type UpdateMeetingResponse } from "@/lib/contracts";
import { NotFoundError, ok, parseBody, requireMeeting, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { withDefaultSummary } from "@/lib/server/summaries";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id → MeetingDetail (+ default_summary_template from prefs). */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const detail = await withDefaultSummary(await requireMeetingDetail(id));
  return Response.json(detail satisfies GetMeetingResponse);
});

/** PATCH /api/meetings/:id — rename / meeting type / move to folder / star / trash (`deleted`) or restore. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateMeetingRequest);
  const current = await requireMeeting(id);
  const { deleted, ...rest } = body;
  const patch: Partial<Omit<Meeting, "id" | "workspace_id" | "created_at">> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  if (deleted !== undefined) patch.deleted_at = deleted ? (current.deleted_at ?? new Date().toISOString()) : null;
  if (patch.folder_id) {
    const folder = await getRepo().getFolder(patch.folder_id);
    if (!folder) throw new NotFoundError("Folder");
  }
  const meeting = await getRepo().updateMeeting(id, patch);
  return Response.json({ meeting } satisfies UpdateMeetingResponse);
});

/** DELETE /api/meetings/:id — soft delete (trash); restore with PATCH {deleted:false}. */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const current = await requireMeeting(id);
  if (!current.deleted_at) await getRepo().updateMeeting(id, { deleted_at: new Date().toISOString() });
  return ok();
});
