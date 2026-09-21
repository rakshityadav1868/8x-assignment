import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GET as getPlaylist } from "@/app/api/playlists/[id]/route";
import type { GetPlaylistResponse } from "@/lib/contracts";
import { PlaylistDetailView } from "@/components/playlists/playlist-detail-view";
import { ErrorState } from "@/components/common/bits";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<{ data: GetPlaylistResponse | null; status: number; error: string | null }> {
  // Reuse the API handler so resolution logic lives in one place.
  const res = await getPlaylist(new Request(`http://internal/api/playlists/${id}`), { params: Promise.resolve({ id }) });
  if (res.ok) return { data: (await res.json()) as GetPlaylistResponse, status: res.status, error: null };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { data: null, status: res.status, error: body.error ?? `Request failed (${res.status})` };
}

export async function generateMetadata(props: PageProps<"/playlists/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const { data } = await load(id);
  return { title: data ? `${data.playlist.name} · Playlists · Fanthom` : "Playlist · Fanthom" };
}

export default async function PlaylistPage(props: PageProps<"/playlists/[id]">) {
  const { id } = await props.params;
  const { data, status, error } = await load(id);
  if (status === 404) notFound();
  if (!data)
    return (
      <div className="mx-auto max-w-md px-6 py-24">
        <ErrorState title="Couldn't load this playlist" description={error ?? undefined} />
      </div>
    );
  return <PlaylistDetailView data={data} />;
}
