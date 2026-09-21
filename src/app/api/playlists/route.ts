import { CreatePlaylistRequest, type ListPlaylistsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/playlists */
export const GET = route(async () => {
  return Response.json({ playlists: await getRepo().listPlaylists() } satisfies ListPlaylistsResponse);
});

/** POST /api/playlists → { playlist } */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, CreatePlaylistRequest);
  const playlist = await getRepo().createPlaylist({ name: body.name.trim(), description: body.description ?? null });
  return Response.json({ playlist }, { status: 201 });
});
