import { AddPlaylistItemRequest } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/playlists/:id/items → { item } */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, AddPlaylistItemRequest);
  const item = await getRepo().addPlaylistItem(id, body);
  return Response.json({ item }, { status: 201 });
});
