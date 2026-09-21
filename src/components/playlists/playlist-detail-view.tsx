"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, ListVideo, Play, SkipBack, SkipForward, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, HIGHLIGHT_META, MeetingTypeBadge } from "@/components/common/bits";
import { ClipView } from "@/components/public/clip-view";
import { ROUTES } from "@/lib/routes";
import type { GetPlaylistResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import { alpha, formatClock, formatDuration } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

type Item = GetPlaylistResponse["items"][number];

export function PlaylistDetailView({ data }: { data: GetPlaylistResponse }) {
  const [items, setItems] = useState<Item[]>(data.items);
  // API is the source of truth (demo mode may render the page on a different instance than the API).
  useEffect(() => {
    const ctrl = new AbortController();
    api<GetPlaylistResponse>(ROUTES.api.playlist(data.playlist.id), { signal: ctrl.signal, cache: "no-store" })
      .then((r) => setItems(r.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [data.playlist.id]);
  const [playing, setPlaying] = useState<number | null>(null);
  const clips = items.filter((i) => i.clip);
  const totalMs = items.reduce(
    (a, i) => a + (i.clip ? i.clip.highlight.end_ms - i.clip.highlight.start_ms : (i.meeting?.duration_sec ?? 0) * 1000),
    0,
  );

  const remove = async (it: Item) => {
    setPlaying(null);
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    try {
      await api(ROUTES.api.playlistItem(data.playlist.id, it.id), { method: "DELETE" });
      toast.success("Removed from playlist");
    } catch (e) {
      setItems(data.items);
      toast.error("Couldn't remove item", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const current = playing !== null ? clips[playing] : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <Link href={ROUTES.pages.playlists} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Playlists
      </Link>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-sky-400/25 bg-primary/15 text-sky-300 shadow-[0_0_30px_-10px_var(--brand)]">
            <ListVideo className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">{data.playlist.name}</h1>
            {data.playlist.description && <p className="mt-0.5 text-sm text-muted-foreground">{data.playlist.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"} · {formatClock(totalMs)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={async () => {
              if (await copyText(window.location.href)) toast.success("Playlist link copied");
            }}
          >
            <Link2 /> Copy link
          </Button>
          <Button onClick={() => setPlaying(0)} disabled={!clips.length} className="rounded-full bg-white text-neutral-950 hover:bg-white/90">
            <Play className="fill-current" /> Play all
          </Button>
        </div>
      </div>

      {current?.clip && playing !== null && (
        <section className="glass animate-rise mt-8 rounded-3xl p-4 md:p-6" aria-label="Now playing">
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm font-medium">
              Playing {playing + 1} of {clips.length}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous clip" disabled={playing === 0} onClick={() => setPlaying(playing - 1)}>
                <SkipBack />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next clip"
                disabled={playing >= clips.length - 1}
                onClick={() => setPlaying(playing + 1)}
              >
                <SkipForward />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Close player" onClick={() => setPlaying(null)}>
                <X />
              </Button>
            </div>
          </div>
          <ClipView
            key={current.id}
            clip={current.clip}
            embedded
            autoPlay
            onEnded={() => setPlaying((i) => (i !== null && i < clips.length - 1 ? i + 1 : null))}
          />
        </section>
      )}

      {items.length === 0 ? (
        <div className="glass mt-8 rounded-2xl">
          <EmptyState
            icon={ListVideo}
            title="This playlist is empty"
            description="Open any highlight in a call transcript and choose “Add to playlist”."
          />
        </div>
      ) : (
        <ol className="glass mt-8 divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
          {items.map((it, idx) => {
            const clipIdx = clips.indexOf(it);
            const isPlaying = clipIdx >= 0 && clipIdx === playing;
            if (it.clip) {
              const h = it.clip.highlight;
              const meta = HIGHLIGHT_META[h.type];
              const Icon = meta.icon;
              return (
                <li key={it.id} className={cn("group flex items-center gap-3 px-4 py-3", isPlaying && "bg-primary/[0.08]")}>
                  <span className="w-5 text-right font-mono text-xs text-muted-foreground">{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setPlaying(clipIdx)}
                    aria-label={`Play ${h.title}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                    style={{ color: meta.color, backgroundColor: alpha(meta.color, 0.14), boxShadow: `inset 0 0 0 1px ${alpha(meta.color, 0.3)}` }}
                  >
                    {isPlaying ? <Play className="size-4 fill-current" /> : <Icon className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link href={ROUTES.pages.clip(h.share_token)} className="block truncate text-sm font-medium hover:underline">
                      {h.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.clip.meeting.title} · {formatClock(h.start_ms)} · {formatClock(h.end_ms - h.start_ms)}
                    </p>
                  </div>
                  <RemoveBtn onClick={() => remove(it)} />
                </li>
              );
            }
            const m = it.meeting;
            return (
              <li key={it.id} className="group flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-right font-mono text-xs text-muted-foreground">{idx + 1}</span>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
                  <Video className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {m ? (
                    <Link href={ROUTES.pages.call(m.id)} className="block truncate text-sm font-medium hover:underline">
                      {m.title}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Deleted call</span>
                  )}
                  {m && (
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      Full call · {formatDuration(m.duration_sec)} <MeetingTypeBadge type={m.meeting_type} />
                    </p>
                  )}
                </div>
                <RemoveBtn onClick={() => remove(it)} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove from playlist"
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
