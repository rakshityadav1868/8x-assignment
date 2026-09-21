"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, ListVideo, Loader2, Play, Plus, SkipBack, SkipForward, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, HIGHLIGHT_META } from "@/components/common/bits";
import { ClipView } from "@/components/public/clip-view";
import { ROUTES } from "@/lib/routes";
import type { ListPlaylistsResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import { alpha, formatClock } from "@/lib/ui/format";
import { HIGHLIGHT_TYPES, type ClipDetail, type HighlightType, type Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlaylistRow = Playlist & { item_count: number };

export function PlaylistsView({
  playlists: initialPlaylists,
  clips: initialClips,
  error,
}: {
  playlists: PlaylistRow[];
  clips: ClipDetail[];
  error: string | null;
}) {
  const [clips, setClips] = useState(initialClips);
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const refreshPlaylists = (signal?: AbortSignal) =>
    api<ListPlaylistsResponse>(ROUTES.api.playlists, { signal, cache: "no-store" })
      .then((r) => setPlaylists(r.playlists))
      .catch(() => {});
  useEffect(() => {
    const ctrl = new AbortController();
    void refreshPlaylists(ctrl.signal);
    return () => ctrl.abort();
  }, []);
  const removeClip = async (c: ClipDetail) => {
    setPlaying(null);
    setClips((prev) => prev.filter((x) => x.highlight.id !== c.highlight.id));
    try {
      await api(ROUTES.api.highlight(c.highlight.id), { method: "DELETE" });
      toast.success("Highlight deleted");
    } catch (e) {
      setClips(initialClips);
      toast.error("Couldn't delete highlight", { description: e instanceof Error ? e.message : undefined });
    }
  };
  const [type, setType] = useState<HighlightType | "all">("all");
  const [playing, setPlaying] = useState<number | null>(null);
  const filtered = useMemo(() => (type === "all" ? clips : clips.filter((c) => c.highlight.type === type)), [clips, type]);
  const totalMs = filtered.reduce((a, c) => a + (c.highlight.end_ms - c.highlight.start_ms), 0);

  if (error)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState title="Couldn't load playlists" description={error} onRetry={() => window.location.reload()} />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Playlists</h1>
          <p className="mt-1 text-sm text-muted-foreground">Collections of the moments that matter, ready to share or binge.</p>
        </div>
        <NewPlaylistDialog onCreated={() => void refreshPlaylists()} />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-sky-400/25 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(8,12,24,0.6))] p-4 shadow-[0_0_40px_-20px_var(--brand)]">
          <Sparkles className="size-4 text-sky-300" />
          <p className="mt-3 font-medium">All highlights</p>
          <p className="text-xs text-muted-foreground">
            Smart playlist · {clips.length} clips · {formatClock(clips.reduce((a, c) => a + c.highlight.end_ms - c.highlight.start_ms, 0))}
          </p>
          <Button
            size="sm"
            onClick={() => setPlaying(0)}
            disabled={!filtered.length}
            className="mt-3 rounded-full bg-white text-neutral-950 hover:bg-white/90"
          >
            <Play className="fill-current" /> Play all
          </Button>
        </div>
        {playlists.map((p) => (
          <Link
            key={p.id}
            href={ROUTES.pages.playlist(p.id)}
            className="glass group rounded-2xl p-4 transition-colors hover:border-sky-400/25 hover:bg-white/[0.04]"
          >
            <ListVideo className="size-4 text-muted-foreground group-hover:text-sky-300" />
            <p className="mt-3 truncate font-medium">{p.name}</p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{p.description ?? "No description"}</p>
            <p className="mt-3 text-xs text-white/60">
              {p.item_count} {p.item_count === 1 ? "item" : "items"} · Open →
            </p>
          </Link>
        ))}
      </div>

      {playing !== null && filtered[playing] && (
        <section className="glass animate-rise mt-8 rounded-3xl p-4 md:p-6" aria-label="Now playing">
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm font-medium">
              Playing {playing + 1} of {filtered.length}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous clip" disabled={playing === 0} onClick={() => setPlaying(playing - 1)}>
                <SkipBack />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next clip"
                disabled={playing >= filtered.length - 1}
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
            key={filtered[playing].highlight.id}
            clip={filtered[playing]}
            embedded
            autoPlay
            onEnded={() => setPlaying((i) => (i !== null && i < filtered.length - 1 ? i + 1 : null))}
          />
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-[15px] font-semibold tracking-tight">Highlights library</h2>
          <TypeChip active={type === "all"} onClick={() => setType("all")} label={`All ${clips.length}`} />
          {HIGHLIGHT_TYPES.map((t) => {
            const n = clips.filter((c) => c.highlight.type === t).length;
            if (!n) return null;
            return <TypeChip key={t} t={t} active={type === t} onClick={() => setType(t)} label={`${HIGHLIGHT_META[t].label} ${n}`} />;
          })}
          <span className="ml-auto text-xs text-muted-foreground">{formatClock(totalMs)} total</span>
        </div>
        {filtered.length === 0 ? (
          <div className="glass mt-4 rounded-2xl">
            <EmptyState
              icon={Sparkles}
              title="No highlights yet"
              description="Hover any transcript line and press “+” to save a moment as a clip."
            />
          </div>
        ) : (
          <ul className="glass mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
            {filtered.map((c, i) => {
              const meta = HIGHLIGHT_META[c.highlight.type];
              const Icon = meta.icon;
              return (
                <li key={c.highlight.id} className={cn("group flex items-center gap-3 px-4 py-3", playing === i && "bg-primary/[0.08]")}>
                  <button
                    type="button"
                    onClick={() => setPlaying(i)}
                    aria-label={`Play ${c.highlight.title}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                    style={{ color: meta.color, backgroundColor: alpha(meta.color, 0.14), boxShadow: `inset 0 0 0 1px ${alpha(meta.color, 0.3)}` }}
                  >
                    {playing === i ? <Play className="size-4 fill-current" /> : <Icon className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link href={ROUTES.pages.clip(c.highlight.share_token)} className="block truncate text-sm font-medium hover:underline">
                      {c.highlight.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.meeting.title} · {formatClock(c.highlight.start_ms)} · {formatClock(c.highlight.end_ms - c.highlight.start_ms)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Copy clip link"
                    onClick={async () => {
                      if (await copyText(`${window.location.origin}${ROUTES.pages.clip(c.highlight.share_token)}`))
                        toast.success("Clip link copied");
                    }}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:bg-white/10 hover:text-foreground group-hover:opacity-100"
                  >
                    <Link2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete highlight"
                    onClick={() => removeClip(c)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-60 hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TypeChip({ t, label, active, onClick }: { t?: HighlightType; label: string; active: boolean; onClick: () => void }) {
  const color = t ? HIGHLIGHT_META[t].color : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        active ? "border-sky-400/40 bg-primary/20 text-white" : "border-white/8 bg-white/[0.03] text-white/70 hover:text-white",
      )}
    >
      {color && <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  );
}

function NewPlaylistDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api(ROUTES.api.playlists, { method: "POST", json: { name: name.trim(), description: desc.trim() || null } });
      toast.success("Playlist created");
      setOpen(false);
      setName("");
      setDesc("");
      onCreated();
    } catch (e) {
      toast.error("Couldn't create playlist", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 rounded-full px-4">
          <Plus /> New playlist
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New playlist</DialogTitle>
          <DialogDescription>Group clips by theme — onboarding, objections, customer quotes.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Name"
            aria-label="Playlist name"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
          />
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" maxLength={1000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving && <Loader2 className="animate-spin" />} Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
