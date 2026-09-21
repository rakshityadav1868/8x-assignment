"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteFolderDialog, FolderNameDialog, useFolders } from "@/components/folders/folder-dialogs";
import { ROUTES } from "@/lib/routes";
import { isNotReady } from "@/lib/ui/use-api";
import type { FolderWithCount } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Folders" section in the app sidebar: list with counts, create / rename / delete. */
export function SidebarFolders({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, error, loading, reload } = useFolders();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<FolderWithCount | null>(null);
  const [deleting, setDeleting] = useState<FolderWithCount | null>(null);
  const folders = data?.folders ?? [];

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Folders</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New folder"
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2 px-3 py-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      ) : error ? (
        <button
          type="button"
          onClick={reload}
          className="px-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {isNotReady(error) ? "Folders are coming online…" : "Couldn't load folders."} <span className="text-sky-300">Retry</span>
        </button>
      ) : folders.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-muted-foreground hover:border-white/20 hover:text-foreground"
        >
          <Plus className="size-3.5" /> Create a folder
        </button>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {folders.map((f) => {
            const href = ROUTES.pages.folder(f.id);
            const active = pathname === href;
            return (
              <li key={f.id} className="group/folder relative">
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg py-1.5 pl-3 pr-8 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <Folder className="size-4 shrink-0" style={{ color: f.color ?? "#60a5fa" }} />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground group-hover/folder:opacity-0">
                    {f.meeting_count}
                  </span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Folder options for ${f.name}`}
                      className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover/folder:opacity-100 aria-expanded:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right">
                    <DropdownMenuItem onSelect={() => setRenaming(f)}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}>
                      <Trash2 /> Delete folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <FolderNameDialog open={creating} onOpenChange={setCreating} />
      <FolderNameDialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)} folder={renaming} />
      <DeleteFolderDialog folder={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}
