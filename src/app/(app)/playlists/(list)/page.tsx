import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import type { ClipDetail } from "@/lib/types";
import { PlaylistsView } from "@/components/playlists/playlists-view";

export const metadata: Metadata = { title: "Playlists · Fanthom" };
export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const repo = getRepo();
  let data: { playlists: Awaited<ReturnType<typeof repo.listPlaylists>>; clips: ClipDetail[] } = { playlists: [], clips: [] };
  let error: string | null = null;
  try {
    const [playlists, meetings] = await Promise.all([repo.listPlaylists(), repo.listMeetings()]);
    const highlights = (await Promise.all(meetings.map((m) => repo.listHighlights(m.id)))).flat();
    const clips = (await Promise.all(highlights.map((h) => repo.getClipByToken(h.share_token)))).filter(
      (c): c is ClipDetail => !!c,
    );
    clips.sort(
      (a, b) =>
        (b.meeting.recording_start ?? "").localeCompare(a.meeting.recording_start ?? "") || a.highlight.start_ms - b.highlight.start_ms,
    );
    data = { playlists, clips };
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }
  return <PlaylistsView playlists={data.playlists} clips={data.clips} error={error} />;
}
