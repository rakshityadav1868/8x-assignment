import { UpdateFolderRequest, type FolderResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/folders/:id */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const folder = await getRepo().getFolder(id);
  if (!folder) throw new NotFoundError("Folder");
  return Response.json({ folder } satisfies FolderResponse);
});

/** PATCH /api/folders/:id — rename / recolor. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateFolderRequest);
  const folder = await getRepo().updateFolder(id, body);
  return Response.json({ folder } satisfies FolderResponse);
});

/** DELETE /api/folders/:id — meetings inside move to "no folder" (never deleted). */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await getRepo().deleteFolder(id);
  return ok();
});
