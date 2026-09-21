"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CircleCheck,
  Folder,
  FolderInput,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarStack } from "@/components/common/participant-avatar";
import { MeetingTypeBadge } from "@/components/common/bits";
import { useTimeZone } from "@/components/common/time-zone";
import { ROUTES } from "@/lib/routes";
import { formatDuration, timeOfDay, longDate } from "@/lib/ui/format";
import type { FolderWithCount, MeetingListItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CallThumb } from "./call-thumb";

export interface RowActions {
  onToggleStar: (m: MeetingListItem) => void;
  onRename: (m: MeetingListItem, title: string) => Promise<boolean>;
  onMove: (m: MeetingListItem) => void;
  onDelete: (m: MeetingListItem) => void;
  onRestore: (m: MeetingListItem) => void;
}

export function CallRow({
  m,
  selected,
  selecting,
  onSelect,
  actions,
  folder,
  showDate,
  showOwner,
}: {
  m: MeetingListItem;
  selected: boolean;
  selecting: boolean;
  onSelect: (m: MeetingListItem, checked: boolean, shift: boolean) => void;
  actions: RowActions;
  folder?: FolderWithCount | null;
  showDate?: boolean;
  showOwner?: boolean;
}) {
  const tz = useTimeZone();
  const start = new Date(m.recording_start ?? m.scheduled_start ?? m.created_at);
  const ready = m.status === "ready";
  const trashed = !!m.deleted_at;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.title);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const t = draft.trim();
    if (!t || t === m.title) {
      setEditing(false);
      setDraft(m.title);
      return;
    }
    setSaving(true);
    const ok = await actions.onRename(m, t);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const meta = (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="tabular-nums" suppressHydrationWarning>
        {showDate ? `${longDate(start, tz)} · ` : ""}
        {timeOfDay(start, tz)}
      </span>
      <span aria-hidden className="text-white/20">
        •
      </span>
      <span>{formatDuration(m.duration_sec)}</span>
      <MeetingTypeBadge type={m.meeting_type} className="ml-1" />
      {m.company_name && (
        <span className="hidden rounded-full border border-white/10 px-1.5 text-[10px] sm:inline">{m.company_name}</span>
      )}
      {folder && (
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Folder className="size-3" style={{ color: folder.color ?? "#60a5fa" }} /> {folder.name}
        </span>
      )}
      {showOwner && m.recorded_by && <span className="hidden sm:inline">by {m.recorded_by}</span>}
      {ready && (m.highlight_count > 0 || m.action_item_count > 0 || (m.comment_count ?? 0) > 0) && (
        <span className="hidden items-center gap-3 pl-1 sm:flex">
          {m.highlight_count > 0 && (
            <span className="inline-flex items-center gap-1" title="Highlights">
              <Sparkles className="size-3 text-sky-300/80" /> {m.highlight_count}
            </span>
          )}
          {m.action_item_count > 0 && (
            <span className="inline-flex items-center gap-1" title="Action items">
              <CircleCheck className="size-3 text-emerald-300/80" /> {m.action_item_count}
            </span>
          )}
          {(m.comment_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1" title="Comments">
              <MessageSquare className="size-3 text-amber-300/80" /> {m.comment_count}
            </span>
          )}
        </span>
      )}
    </div>
  );

  return (
    <li
      className={cn(
        "group relative flex min-h-[76px] items-center gap-3 px-3 py-3 transition-colors hover:bg-white/[0.035] sm:gap-4 sm:px-4",
        selected && "bg-primary/[0.07] hover:bg-primary/[0.09]",
        (selecting || selected) && "pl-11 md:pl-4",
        trashed && "opacity-80",
      )}
    >
      <div
        className={cn(
          "absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-[#0b1120]/80 p-0.5 transition-opacity md:left-5 md:top-3.5 md:translate-y-0",
          selecting || selected ? "block opacity-100" : "hidden md:block md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
        )}
      >
        <Checkbox
          checked={selected}
          onClick={(e) => {
            e.preventDefault();
            onSelect(m, !selected, e.shiftKey);
          }}
          aria-label={`Select ${m.title}`}
        />
      </div>

      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <CallThumb meeting={m} />
          <div className="min-w-0 flex-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDraft(m.title);
                    setEditing(false);
                  }
                }}
                maxLength={200}
                aria-label="Call title"
                className="h-8 w-full min-w-0 rounded-lg border border-primary/50 bg-white/[0.05] px-2.5 text-[15px] font-medium outline-none"
              />
              {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </form>
            {meta}
          </div>
        </div>
      ) : (
        <Link
          href={ROUTES.pages.call(m.id)}
          onClick={(e) => {
            if (selecting) {
              e.preventDefault();
              onSelect(m, !selected, e.shiftKey);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-none"
        >
          <CallThumb meeting={m} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-medium tracking-tight group-hover:text-white">{m.title}</p>
              {m.participants.some((p) => p.is_external) && (
                <span className="hidden shrink-0 rounded-full border border-white/10 px-1.5 text-[10px] text-muted-foreground sm:inline">
                  External
                </span>
              )}
            </div>
            {meta}
          </div>
        </Link>
      )}

      <div className="relative z-10 flex shrink-0 items-center gap-1.5 sm:gap-3">
        <StatusPill m={m} />
        <AvatarStack people={m.participants} max={4} className="hidden lg:flex" />
        {!trashed && (
          <button
            type="button"
            onClick={() => actions.onToggleStar(m)}
            aria-label={m.starred ? "Unstar" : "Star"}
            aria-pressed={!!m.starred}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10",
              m.starred ? "text-amber-300" : "text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
            )}
          >
            <Star className={cn("size-4", m.starred && "fill-current")} />
          </button>
        )}
        {trashed ? (
          <button
            type="button"
            onClick={() => actions.onRestore(m)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs hover:bg-white/10"
          >
            <RotateCcw className="size-3.5" /> Restore
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${m.title}`}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground aria-expanded:bg-white/10"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(m.title);
                  setEditing(true);
                }}
              >
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onMove(m)}>
                <FolderInput /> Move to folder…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onToggleStar(m)}>
                <Star /> {m.starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSelect(m, true, false)}>
                <CircleCheck /> Select
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(m)}>
                <Trash2 /> Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <ArrowRight className="hidden size-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 xl:block" />
      </div>
    </li>
  );
}

export function StatusPill({ m }: { m: MeetingListItem }) {
  if (m.status === "processing")
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/12 px-2.5 text-[11px] font-medium text-sky-300">
        <Loader2 className="size-3 animate-spin" />
        <span className="hidden sm:inline">
          {m.processing_stage === "transcribing" ? "Transcribing" : m.processing_stage === "analyzing" ? "Analyzing" : "Processing"}
        </span>
      </span>
    );
  if (m.status === "failed")
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-red-400/10 px-2.5 text-[11px] font-medium text-red-300">
        <AlertCircle className="size-3" /> Failed
      </span>
    );
  return null;
}
