import { getRepo } from "@/lib/db";
import { ok, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** DELETE /api/playlists/:id/items/:itemId → Ok */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) => {
  const { id, itemId } = await params;
  const repo = getRepo();
  await repo.removePlaylistItem(id, itemId);
  return ok();
});
