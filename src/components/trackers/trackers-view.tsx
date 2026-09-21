"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Plus, Radar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { DashCard, PageHeader, PageShell } from "@/components/insights/dash-ui";
import { apiErrorMessage, useApi } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { ListTrackersResponse } from "@/lib/contracts";
import type { TrackerWithStats } from "@/lib/types";
import { api } from "@/lib/ui/api";
import { alpha } from "@/lib/ui/format";
import { timeAgo } from "@/lib/ui/time-ago";
import { TrackerDialog } from "./tracker-dialog";

export function TrackersView() {
  const q = useApi<ListTrackersResponse>(ROUTES.api.trackers);
  const router = useRouter();
  const [editing, setEditing] = useState<TrackerWithStats | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TrackerWithStats | null>(null);
  const trackers = q.data?.trackers ?? [];

  const upsert = (t: TrackerWithStats) =>
    q.setData((d) => {
      const list = d?.trackers ?? [];
      return { trackers: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [t, ...list] };
    });

  return (
    <PageShell>
      <PageHeader
        title="Trackers"
        description="Keywords and phrases Fanthom listens for in every call."
        actions={
          <Button onClick={() => setCreating(true)} className="rounded-full">
            <Plus /> New tracker
          </Button>
        }
      />

      <div className="mt-8">
        {q.error && !q.data ? (
          <DashCard>
            <ErrorState title="Couldn't load trackers" description={apiErrorMessage(q.error)} onRetry={q.reload} />
          </DashCard>
        ) : !q.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : trackers.length === 0 ? (
          <DashCard>
            <EmptyState
              icon={Radar}
              title="No trackers yet"
              description="Create one for competitors, pricing or security questions to see every mention across calls."
              action={
                <Button onClick={() => setCreating(true)} size="sm">
                  <Plus /> New tracker
                </Button>
              }
            />
          </DashCard>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trackers.map((t) => (
              <li key={t.id}>
                <TrackerCard
                  t={t}
                  onOpen={() => router.push(ROUTES.pages.tracker(t.id))}
                  onEdit={() => setEditing(t)}
                  onDelete={() => setDeleting(t)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <TrackerDialog
        open={creating || !!editing}
        tracker={editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={(t) => {
          upsert(t);
          setCreating(false);
          setEditing(null);
        }}
      />
      <DeleteTrackerDialog
        tracker={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => q.setData((d) => (d ? { trackers: d.trackers.filter((x) => x.id !== id) } : d))}
      />
    </PageShell>
  );
}

function TrackerCard({ t, onOpen, onEdit, onDelete }: { t: TrackerWithStats; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      className="group relative flex h-full flex-col rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4 transition-colors hover:border-white/15"
      style={{ boxShadow: `inset 0 1px 0 0 ${alpha(t.color, 0.35)}` }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color, boxShadow: `0 0 12px ${alpha(t.color, 0.7)}` }} />
        <div className="min-w-0 flex-1">
          <Link href={ROUTES.pages.tracker(t.id)} className="font-medium after:absolute after:inset-0 hover:text-sky-200">
            {t.name}
          </Link>
          {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${t.name}`}
              className="relative z-10 -mr-1 -mt-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={onOpen}>
              <Radar /> View mentions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {t.keywords.slice(0, 8).map((k) => (
          <span key={k} className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/80">
            {k}
          </span>
        ))}
        {t.keywords.length > 8 && <span className="px-1 text-[11px] text-muted-foreground">+{t.keywords.length - 8}</span>}
      </div>
      <div className="mt-auto flex items-end gap-5 pt-4">
        <div>
          <p className="text-xl font-semibold tabular-nums">{t.hit_count}</p>
          <p className="text-[11px] text-muted-foreground">mentions</p>
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums">{t.meeting_count}</p>
          <p className="text-[11px] text-muted-foreground">calls</p>
        </div>
        <p className="ml-auto text-[11px] text-muted-foreground" suppressHydrationWarning>
          {t.last_hit_at ? `Last ${timeAgo(t.last_hit_at)}` : "No mentions yet"}
        </p>
      </div>
    </div>
  );
}

export function DeleteTrackerDialog({
  tracker,
  onClose,
  onDeleted,
}: {
  tracker: TrackerWithStats | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!tracker) return;
    setBusy(true);
    try {
      await api(ROUTES.api.tracker(tracker.id), { method: "DELETE" });
      toast.success(`Deleted “${tracker.name}”`);
      onDeleted(tracker.id);
      onClose();
    } catch (e) {
      toast.error("Couldn't delete tracker", { description: apiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tracker} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete tracker?</DialogTitle>
          <DialogDescription>
            “{tracker?.name}” stops being tracked. Your calls and transcripts are not affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={del} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
