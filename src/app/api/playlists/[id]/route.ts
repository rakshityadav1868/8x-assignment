import type { GetPlaylistResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, NotFoundError, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import type { MeetingDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/playlists/:id → { playlist, items (with meeting row / clip details) } */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const repo = getRepo();
  if (!repo.getPlaylist) throw new HttpError(501, "not_implemented", "Playlist details aren't available yet.");
  const pl = await repo.getPlaylist(id);
  if (!pl) throw new NotFoundError("Playlist");

  const meetings = await repo.listMeetings();
  const rowById = new Map(meetings.map((m) => [m.id, m]));
  // Resolve highlight ids → meeting (demo scale: scan meeting details once, lazily).
  let details: MeetingDetail[] | null = null;
  const findHighlightMeeting = async (hid: string) => {
    details ??= (await Promise.all(meetings.map((m) => repo.getMeetingDetail(m.id)))).filter((d): d is MeetingDetail => !!d);
    return details.find((d) => d.highlights.some((h) => h.id === hid)) ?? null;
  };

  const { items, ...playlist } = pl;
  const resolved: GetPlaylistResponse["items"] = [];
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    if (item.highlight_id) {
      const d = await findHighlightMeeting(item.highlight_id);
      const h = d?.highlights.find((x) => x.id === item.highlight_id);
      const clip = h ? await repo.getClipByToken(h.share_token) : null;
      if (!d || !clip) continue;
      resolved.push({ ...item, meeting: rowById.get(d.meeting.id) ?? null, clip });
    } else if (item.meeting_id) {
      const row = rowById.get(item.meeting_id);
      if (!row) continue;
      resolved.push({ ...item, meeting: row, clip: null });
    }
  }
  return Response.json({ playlist: { ...playlist, item_count: resolved.length }, items: resolved } satisfies GetPlaylistResponse);
});
