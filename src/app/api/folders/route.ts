import { CreateFolderRequest, type FolderResponse, type ListFoldersResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/folders — sidebar folders (by name) with meeting counts. */
export const GET = route(async () => {
  const folders = await getRepo().listFolders();
  return Response.json({ folders } satisfies ListFoldersResponse);
});

/** POST /api/folders */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, CreateFolderRequest);
  const folder = await getRepo().createFolder({ name: body.name, color: body.color ?? null });
  return Response.json({ folder } satisfies FolderResponse, { status: 201 });
});
