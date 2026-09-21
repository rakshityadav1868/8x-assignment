import { getRepo } from "@/lib/db";
import { HttpError, ok, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** DELETE /api/playlists/:id/items/:itemId → Ok */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) => {
  const { id, itemId } = await params;
  const repo = getRepo();
  if (!repo.removePlaylistItem) throw new HttpError(501, "not_implemented", "Removing playlist items isn't available yet.");
  await repo.removePlaylistItem(id, itemId);
  return ok();
});
