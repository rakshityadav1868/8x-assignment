import { BulkMeetingsRequest, type BulkMeetingsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, parseBody, route } from "@/lib/server/api";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/meetings/bulk — move / star / unstar / delete (trash) / restore many calls at once. */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, BulkMeetingsRequest);
  const repo = getRepo();
  const ids = Array.from(new Set(body.meeting_ids));
  let patch: Partial<Pick<Meeting, "folder_id" | "starred" | "deleted_at">>;
  switch (body.action) {
    case "move":
      if (body.folder_id && !(await repo.getFolder(body.folder_id))) throw new NotFoundError("Folder");
      patch = { folder_id: body.folder_id ?? null };
      break;
    case "star":
      patch = { starred: true };
      break;
    case "unstar":
      patch = { starred: false };
      break;
    case "delete":
      patch = { deleted_at: new Date().toISOString() };
      break;
    case "restore":
      patch = { deleted_at: null };
      break;
  }
  const updated = await repo.updateMeetings(ids, patch);
  return Response.json({ updated } satisfies BulkMeetingsResponse);
});
