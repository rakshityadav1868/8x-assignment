"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Folder, FolderMinus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTES } from "@/lib/routes";
import type { FolderResponse, ListFoldersResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, invalidate, useApi } from "@/lib/ui/use-api";
import type { FolderWithCount } from "@/lib/types";
import { cn } from "@/lib/utils";

export const FOLDER_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#f87171", "#22d3ee", "#94a3b8"];

/** Shared folder list (sidebar, move dialog, filter bar) — refetches on `invalidate("folders")`. */
export function useFolders() {
  return useApi<ListFoldersResponse>(ROUTES.api.folders, { tags: ["folders"] });
}

/** Create (folder = undefined) or rename/recolor an existing folder. */
export function FolderNameDialog({
  open,
  onOpenChange,
  folder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folder?: FolderWithCount | null;
  onSaved?: (f: FolderWithCount) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open && <FolderNameForm folder={folder} onDone={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function FolderNameForm({
  folder,
  onDone,
  onSaved,
}: {
  folder?: FolderWithCount | null;
  onDone: () => void;
  onSaved?: (f: FolderWithCount) => void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<string>(folder?.color ?? FOLDER_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const r = folder
        ? await api<FolderResponse>(ROUTES.api.folder(folder.id), { method: "PATCH", json: { name: n, color } })
        : await api<FolderResponse>(ROUTES.api.folders, { method: "POST", json: { name: n, color } });
      invalidate("folders");
      toast.success(folder ? "Folder renamed" : `Folder “${r.folder.name}” created`);
      onSaved?.(r.folder);
      onDone();
    } catch (err) {
      toast.error(folder ? "Couldn't rename folder" : "Couldn't create folder", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{folder ? "Rename folder" : "New folder"}</DialogTitle>
        <DialogDescription>Folders keep related calls together — by customer, project or team.</DialogDescription>
      </DialogHeader>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="e.g. Acme Logistics"
        aria-label="Folder name"
        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
      />
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Folder color">
        {FOLDER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={`Color ${c}`}
            onClick={() => setColor(c)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110",
              color === c && "ring-2 ring-white/70",
            )}
            style={{ backgroundColor: c }}
          >
            {color === c && <Check className="size-3 text-black/70" />}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy && <Loader2 className="animate-spin" />} {folder ? "Save" : "Create folder"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteFolderDialog({
  folder,
  onOpenChange,
}: {
  folder: FolderWithCount | null;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!folder) return;
    setBusy(true);
    try {
      await api(ROUTES.api.folder(folder.id), { method: "DELETE" });
      invalidate("folders", "meetings");
      toast.success(`Deleted “${folder.name}”`, { description: "Its calls are still in your library." });
      if (window.location.pathname === ROUTES.pages.folder(folder.id)) router.push(ROUTES.pages.calls);
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't delete folder", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!folder} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{folder?.name}”?</DialogTitle>
          <DialogDescription>
            The folder is removed. The {folder?.meeting_count ?? 0} call{folder?.meeting_count === 1 ? "" : "s"} inside stay in
            your library — nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={del} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Delete folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a destination folder for one or many calls. Calls `onMove(folderId | null)`. */
export function MoveToFolderDialog({
  open,
  onOpenChange,
  count,
  currentFolderId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  currentFolderId?: string | null;
  onMove: (folderId: string | null, folderName: string | null) => Promise<void> | void;
}) {
  const { data, error, loading } = useFolders();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const folders = data?.folders ?? [];
  const move = async (id: string | null, name: string | null) => {
    setBusy(id ?? "none");
    try {
      await onMove(id, name);
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Dialog open={open && !creating} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {count === 1 ? "call" : `${count} calls`} to…</DialogTitle>
            <DialogDescription>Choose a folder. A call lives in one folder at a time.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading folders…
              </div>
            ) : error ? (
              <p className="px-3 py-4 text-sm text-red-300">{errorMessage(error)}</p>
            ) : (
              <ul className="grid gap-0.5">
                {folders.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => move(f.id, f.name)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-60"
                    >
                      <Folder className="size-4" style={{ color: f.color ?? "#60a5fa" }} />
                      <span className="flex-1 truncate">{f.name}</span>
                      {busy === f.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : currentFolderId === f.id ? (
                        <Check className="size-3.5 text-sky-300" />
                      ) : (
                        <span className="text-xs tabular-nums text-muted-foreground">{f.meeting_count}</span>
                      )}
                    </button>
                  </li>
                ))}
                {folders.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No folders yet.</li>}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
              <Plus /> New folder
            </Button>
            {currentFolderId !== undefined && (
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => move(null, null)}>
                <FolderMinus /> Remove from folder
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <FolderNameDialog
        open={creating}
        onOpenChange={(o) => setCreating(o)}
        onSaved={(f) => {
          setCreating(false);
          void move(f.id, f.name);
        }}
      />
    </>
  );
}
