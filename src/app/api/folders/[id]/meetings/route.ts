import { MoveToFolderRequest, type BulkMeetingsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/folders/:id/meetings — move calls into the folder (`:id` = "none" removes them from any folder). */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, MoveToFolderRequest);
  const repo = getRepo();
  const folderId = id === "none" ? null : id;
  if (folderId && !(await repo.getFolder(folderId))) throw new NotFoundError("Folder");
  const updated = await repo.updateMeetings(Array.from(new Set(body.meeting_ids)), { folder_id: folderId });
  return Response.json({ updated } satisfies BulkMeetingsResponse);
});
