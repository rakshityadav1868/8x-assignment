"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckSquare,
  Folder,
  FolderInput,
  Mic,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { useTimeZone } from "@/components/common/time-zone";
import { MoveToFolderDialog, useFolders } from "@/components/folders/folder-dialogs";
import { SendBotButton } from "@/components/record/send-bot-dialog";
import { ROUTES } from "@/lib/routes";
import type { BulkMeetingsResponse, ListMeetingsResponse, PrefsResponse, UpdateMeetingResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, invalidate, useApi, useDebounced } from "@/lib/ui/use-api";
import { dayKey, dayLabel, formatDuration } from "@/lib/ui/format";
import { MEETING_TYPE_LABELS } from "@/lib/templates";
import type { BulkMeetingAction, FolderWithCount, MeetingListItem, ShareScope, UpcomingMeeting } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CallsListSkeleton } from "./calls-skeleton";
import { CallRow, type RowActions } from "./call-row";
import { EMPTY_FILTERS, LibraryFilterBar, activeFilterCount, useFacets, type LibraryFilterState } from "./library-filters";
import { UpcomingStrip } from "./upcoming-strip";

const TABS: { key: ShareScope; label: string; hint: string }[] = [
  { key: "mine", label: "My calls", hint: "Calls you recorded" },
  { key: "shared", label: "Shared with me", hint: "Calls teammates shared with you" },
  { key: "team", label: "Team", hint: "Everything recorded across your workspace" },
];

function buildQuery(scope: ShareScope | "all", f: LibraryFilterState, folderId?: string): string {
  const p = new URLSearchParams();
  p.set("scope", scope);
  if (folderId) p.set("folder_id", folderId);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.meeting_type) p.set("meeting_type", f.meeting_type);
  if (f.participant) p.set("participant", f.participant);
  if (f.company) p.set("company", f.company);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.has_action_items) p.set("has_action_items", "true");
  if (f.starred) p.set("starred", "true");
  if (f.trash) p.set("trash", "true");
  p.set("sort", f.sort);
  return `${ROUTES.api.meetings}?${p.toString()}`;
}

const when = (m: MeetingListItem) => m.recording_start ?? m.scheduled_start ?? m.created_at;

/**
 * Defensive client-side pass with the same semantics as the server's `filterMeetings`, so the library
 * behaves correctly even against an older API that ignores query params. Idempotent on filtered data.
 */
function applyFilters(list: MeetingListItem[], scope: ShareScope | "all", f: LibraryFilterState, folderId?: string) {
  const q = f.q.trim().toLowerCase();
  const part = f.participant?.toLowerCase();
  const company = f.company?.toLowerCase();
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : null;
  const out = list.filter((m) => {
    if (f.trash ? !m.deleted_at : m.deleted_at) return false;
    if (scope !== "all" && m.scope && m.scope !== scope) return false;
    if (folderId && m.folder_id !== undefined && m.folder_id !== folderId) return false;
    if (f.meeting_type && m.meeting_type !== f.meeting_type) return false;
    if (f.has_action_items && m.action_item_count === 0) return false;
    if (f.starred && !m.starred) return false;
    if (q && !m.title.toLowerCase().includes(q) && !(MEETING_TYPE_LABELS[m.meeting_type] ?? "").toLowerCase().includes(q) && !m.participants.some((p) => p.name.toLowerCase().includes(q)))
      return false;
    if (part && !m.participants.some((p) => p.name.toLowerCase() === part || p.email?.toLowerCase() === part)) return false;
    if (company && m.company_domain?.toLowerCase() !== company && !m.participants.some((p) => p.email?.toLowerCase().endsWith(`@${company}`)))
      return false;
    const t = new Date(when(m)).getTime();
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    return true;
  });
  const by: Record<LibraryFilterState["sort"], (a: MeetingListItem, b: MeetingListItem) => number> = {
    newest: (a, b) => when(b).localeCompare(when(a)),
    oldest: (a, b) => when(a).localeCompare(when(b)),
    longest: (a, b) => b.duration_sec - a.duration_sec,
    shortest: (a, b) => a.duration_sec - b.duration_sec,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return out.sort(by[f.sort]);
}

export function LibraryView({
  upcoming = [],
  nowIso,
  folderId,
  folder: initialFolder,
}: {
  upcoming?: UpcomingMeeting[];
  /** Server "now" so day grouping is identical on server and client. */
  nowIso: string;
  /** When set, this is a folder page: no scope tabs, list limited to the folder. */
  folderId?: string;
  folder?: FolderWithCount | null;
}) {
  const tz = useTimeZone();
  const [scope, setScope] = useState<ShareScope>("mine");
  const [filters, setFilters] = useState<LibraryFilterState>(EMPTY_FILTERS);
  const effScope: ShareScope | "all" = folderId ? "all" : scope;
  const debouncedQ = useDebounced(filters.q, 300);
  const url = buildQuery(effScope, { ...filters, q: debouncedQ }, folderId);
  const { data, error, loading, reload, setData } = useApi<ListMeetingsResponse>(url, { tags: ["meetings"] });
  // Facets come from the whole (non-deleted) library so options don't shrink as you filter.
  const facetsReq = useApi<ListMeetingsResponse>(`${ROUTES.api.meetings}?scope=all`, { tags: ["meetings"] });
  const facets = useFacets(facetsReq.data?.meetings ?? []);
  const { data: foldersData } = useFolders();
  const prefs = useApi<PrefsResponse>(folderId ? null : ROUTES.api.prefs, { tags: ["prefs"] }).data?.prefs;
  const folderList = foldersData?.folders ?? data?.folders;
  const folderById = useMemo(() => new Map((folderList ?? []).map((f) => [f.id, f])), [folderList]);
  const folder = folderId ? (folderById.get(folderId) ?? initialFolder ?? null) : null;

  const meetings = useMemo(
    () => applyFilters(data?.meetings ?? [], effScope, filters, folderId),
    [data, effScope, filters, folderId],
  );

  // ---- selection -----------------------------------------------------------------------------------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [prevUrl, setPrevUrl] = useState(url);
  if (prevUrl !== url) {
    setPrevUrl(url);
    setSelected(new Set());
  }
  const selecting = selectMode || selected.size > 0;
  const onSelect = useCallback(
    (m: MeetingListItem, checked: boolean, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && lastClicked) {
          const ids = meetings.map((x) => x.id);
          const a = ids.indexOf(lastClicked);
          const b = ids.indexOf(m.id);
          if (a >= 0 && b >= 0) {
            for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
              if (checked) next.add(id);
              else next.delete(id);
            }
            return next;
          }
        }
        if (checked) next.add(m.id);
        else next.delete(m.id);
        return next;
      });
      setLastClicked(m.id);
    },
    [lastClicked, meetings],
  );
  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  // ---- mutations -----------------------------------------------------------------------------------
  const patchLocal = (ids: string[], patch: Partial<MeetingListItem>) =>
    setData((d) => (d ? { ...d, meetings: d.meetings.map((m) => (ids.includes(m.id) ? { ...m, ...patch } : m)) } : d));
  const removeLocal = (ids: string[]) =>
    setData((d) => (d ? { ...d, meetings: d.meetings.filter((m) => !ids.includes(m.id)) } : d));

  const bulk = async (ids: string[], action: BulkMeetingAction, folder_id?: string | null) => {
    const r = await api<BulkMeetingsResponse>(ROUTES.api.meetingsBulk, {
      method: "POST",
      json: { meeting_ids: ids, action, ...(action === "move" ? { folder_id: folder_id ?? null } : {}) },
    });
    return r.updated;
  };

  // Writes are applied optimistically and never followed by a list re-read: on Vercel the next GET can land on a
  // different (demo-mode, in-memory) instance and resurrect stale state. The list refetches only on navigation.
  const restore = async (ids: string[], quiet = false) => {
    const snapshot = data;
    if (filters.trash) removeLocal(ids);
    try {
      if (ids.length === 1) await api<UpdateMeetingResponse>(ROUTES.api.meeting(ids[0]), { method: "PATCH", json: { deleted: false } });
      else await bulk(ids, "restore");
      invalidate("folders");
      if (!quiet) toast.success(ids.length === 1 ? "Call restored" : `${ids.length} calls restored`);
      return true;
    } catch (e) {
      setData(snapshot);
      toast.error("Couldn't restore", { description: errorMessage(e) });
      return false;
    }
  };

  const trash = async (ids: string[]) => {
    const snapshot = data;
    const removed = (data?.meetings ?? []).filter((m) => ids.includes(m.id));
    removeLocal(ids);
    setSelected(new Set());
    try {
      if (ids.length === 1) await api(ROUTES.api.meeting(ids[0]), { method: "DELETE" });
      else await bulk(ids, "delete");
      invalidate("folders");
      toast(ids.length === 1 ? "Moved to trash" : `${ids.length} calls moved to trash`, {
        description: "Restore anytime from the Trash filter.",
        action: {
          label: "Undo",
          onClick: () => {
            // Put the rows straight back (sorted by applyFilters), then persist; roll back if the write fails.
            setData((d) => (d ? { ...d, meetings: [...d.meetings.filter((m) => !ids.includes(m.id)), ...removed] } : d));
            void restore(ids, true).then((ok) => {
              if (ok) toast.success(ids.length === 1 ? "Call restored" : `${ids.length} calls restored`);
              else removeLocal(ids);
            });
          },
        },
      });
    } catch (e) {
      setData(snapshot);
      toast.error("Couldn't delete", { description: errorMessage(e) });
    }
  };

  const setStar = async (ids: string[], starred: boolean) => {
    const snapshot = data;
    patchLocal(ids, { starred });
    try {
      if (ids.length === 1) await api<UpdateMeetingResponse>(ROUTES.api.meeting(ids[0]), { method: "PATCH", json: { starred } });
      else await bulk(ids, starred ? "star" : "unstar");
      if (filters.starred && !starred) removeLocal(ids);
      if (ids.length > 1) toast.success(`${starred ? "Starred" : "Unstarred"} ${ids.length} calls`);
    } catch (e) {
      setData(snapshot);
      toast.error("Couldn't update star", { description: errorMessage(e) });
    }
  };

  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const moveCurrent =
    moveIds?.length === 1 ? (data?.meetings.find((m) => m.id === moveIds[0])?.folder_id ?? null) : undefined;
  const doMove = async (folder_id: string | null, name: string | null) => {
    if (!moveIds) return;
    const ids = moveIds;
    try {
      if (folder_id) await api(ROUTES.api.folderMeetings(folder_id), { method: "POST", json: { meeting_ids: ids } });
      else await api(ROUTES.api.folderMeetings("none"), { method: "POST", json: { meeting_ids: ids } });
      if (folderId && folder_id !== folderId) removeLocal(ids);
      else patchLocal(ids, { folder_id });
      setSelected(new Set());
      invalidate("folders");
      toast.success(
        name ? `Moved ${ids.length === 1 ? "call" : `${ids.length} calls`} to “${name}”` : "Removed from folder",
        folder_id && folder_id !== folderId
          ? { action: { label: "Open folder", onClick: () => (window.location.href = ROUTES.pages.folder(folder_id)) } }
          : undefined,
      );
    } catch (e) {
      toast.error("Couldn't move", { description: errorMessage(e) });
      throw e;
    }
  };

  const actions: RowActions = {
    onToggleStar: (m) => void setStar([m.id], !m.starred),
    onRename: async (m, title) => {
      const prev = m.title;
      patchLocal([m.id], { title });
      try {
        await api<UpdateMeetingResponse>(ROUTES.api.meeting(m.id), { method: "PATCH", json: { title } });
        toast.success("Renamed");
        return true;
      } catch (e) {
        patchLocal([m.id], { title: prev });
        toast.error("Couldn't rename", { description: errorMessage(e) });
        return false;
      }
    },
    onMove: (m) => setMoveIds([m.id]),
    onDelete: (m) => void trash([m.id]),
    onRestore: (m) => void restore([m.id]),
  };

  // ---- grouping ------------------------------------------------------------------------------------
  const grouped = filters.sort === "newest" || filters.sort === "oldest";
  const groups = useMemo(() => {
    if (!grouped) return [{ label: "", items: meetings }];
    const now = new Date(nowIso);
    const map = new Map<string, { label: string; items: MeetingListItem[] }>();
    for (const m of meetings) {
      const d = new Date(when(m));
      const k = dayKey(d, tz);
      if (!map.has(k)) map.set(k, { label: dayLabel(d, now, tz), items: [] });
      map.get(k)!.items.push(m);
    }
    return [...map.values()];
  }, [meetings, grouped, nowIso, tz]);

  const filtered = activeFilterCount(filters) > 0 || !!filters.q.trim();
  const totalSec = meetings.reduce((a, m) => a + m.duration_sec, 0);
  const allSelected = meetings.length > 0 && meetings.every((m) => selected.has(m.id));

  const title = folderId ? (folder?.name ?? "Folder") : "My Calls";
  const subtitle = loading
    ? "Loading…"
    : filters.trash
      ? `${meetings.length} in trash · restore anything you deleted by mistake.`
      : meetings.length > 0
        ? `${meetings.length} recording${meetings.length === 1 ? "" : "s"} · ${formatDuration(totalSec)} of conversations${filtered ? " match" : ""}.`
        : folderId
          ? "An empty folder — move calls here from your library."
          : "Recordings, transcripts and AI notes from your meetings.";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pt-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {folderId && (
            <Link href={ROUTES.pages.calls} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Library <span aria-hidden>/</span>
            </Link>
          )}
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
            {folderId && <Folder className="size-6 shrink-0" style={{ color: folder?.color ?? "#60a5fa" }} />}
            <span className="truncate">{title}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <SendBotButton className="h-9" />
          <Button asChild variant="outline" className="h-9 rounded-full px-3.5">
            <Link href={ROUTES.pages.record}>
              <Mic /> <span className="hidden sm:inline">Record</span>
            </Link>
          </Button>
          <Button asChild className="h-9 rounded-full px-3.5">
            <Link href={ROUTES.pages.upload}>
              <Upload /> <span className="hidden sm:inline">Upload</span>
            </Link>
          </Button>
        </div>
      </div>

      {!folderId && (
        <div role="tablist" aria-label="Library" className="mt-6 flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={scope === t.key}
              title={t.hint}
              onClick={() => setScope(t.key)}
              className={cn(
                "relative -mb-px shrink-0 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
                scope === t.key && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:shadow-[0_0_8px_var(--brand)]",
              )}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => (selecting ? clearSelection() : setSelectMode(true))}
            className="mb-1.5 ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground md:hidden"
          >
            <CheckSquare className="size-3.5" /> {selecting ? "Done" : "Select"}
          </button>
        </div>
      )}

      <div className="mt-4">
        <LibraryFilterBar value={filters} onChange={setFilters} facets={facets} />
      </div>

      {!folderId && prefs && !prefs.onboarding_completed && (
        <Link
          href={ROUTES.pages.welcome}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] p-3.5 text-sm transition-colors hover:bg-primary/[0.1]"
        >
          <Sparkles className="size-4 shrink-0 text-sky-300" />
          <span className="flex-1">
            Finish setting up Fanthom
            <span className="block text-xs text-muted-foreground">Connect a calendar, pick your notes template and capture a first call.</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      {!folderId && scope === "mine" && !filtered && !filters.trash && upcoming.length > 0 && (
        <UpcomingStrip upcoming={upcoming} nowIso={nowIso} />
      )}

      {filters.trash && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-3.5 py-2.5 text-xs text-red-100/80">
          <Trash2 className="size-3.5 shrink-0 text-red-300" />
          You’re viewing the trash. Deleted calls keep their transcript and notes until you restore them.
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <CallsListSkeleton />
        ) : error && !data ? (
          <div className="glass rounded-2xl">
            <ErrorState title="Couldn't load your calls" description={errorMessage(error)} onRetry={reload} />
          </div>
        ) : meetings.length === 0 ? (
          <div className="glass rounded-2xl">
            {filters.trash ? (
              <EmptyState icon={Trash2} title="Trash is empty" description="Calls you delete land here, so nothing is lost by accident." />
            ) : filtered ? (
              <EmptyState
                icon={Search}
                title="No calls match these filters"
                description="Try removing a filter — or search what was said inside your calls."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" className="rounded-full" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                      <X /> Clear filters
                    </Button>
                    {filters.q.trim() && (
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href={ROUTES.pages.search(filters.q.trim())}>
                          Search transcripts <ArrowRight />
                        </Link>
                      </Button>
                    )}
                  </div>
                }
              />
            ) : folderId ? (
              <EmptyState
                icon={Folder}
                title="Nothing in this folder yet"
                description="Use “Move to folder” on any call, or select several and move them together."
                action={
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={ROUTES.pages.calls}>Go to library</Link>
                  </Button>
                }
              />
            ) : scope === "shared" ? (
              <EmptyState icon={Video} title="Nothing shared with you yet" description="When a teammate shares a call with you, it shows up here." />
            ) : scope === "team" ? (
              <EmptyState icon={Video} title="No team calls yet" description="Calls your teammates record appear here." />
            ) : (
              <EmptyState
                icon={Video}
                title="No calls yet"
                description="Record in your browser, send Fanthom to a meeting, or upload a recording."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild className="rounded-full">
                      <Link href={ROUTES.pages.record}>
                        <Mic /> Record
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={ROUTES.pages.upload}>
                        <Upload /> Upload
                      </Link>
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((g, gi) => (
              <section key={g.label || gi} aria-label={g.label || "Calls"}>
                {g.label && (
                  <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    {g.label}
                  </h2>
                )}
                <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
                  {g.items.map((m) => (
                    <CallRow
                      key={m.id}
                      m={m}
                      selected={selected.has(m.id)}
                      selecting={selecting}
                      onSelect={onSelect}
                      actions={actions}
                      folder={!folderId && m.folder_id ? folderById.get(m.folder_id) : null}
                      showDate={!grouped}
                      showOwner={scope !== "mine" || !!folderId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
          <div className="animate-rise flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-[#0b1120]/95 p-1.5 pl-4 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8),0_0_40px_-20px_var(--brand)] backdrop-blur-xl [scrollbar-width:none]">
            <span className="shrink-0 pr-2 text-sm font-medium tabular-nums">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(meetings.map((m) => m.id)))}
              className="h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              {allSelected ? "Select none" : "Select all"}
            </button>
            {filters.trash ? (
              <BarButton icon={RotateCcw} onClick={() => void restore([...selected]).then(() => setSelected(new Set()))}>
                Restore
              </BarButton>
            ) : (
              <>
                <BarButton icon={FolderInput} onClick={() => setMoveIds([...selected])}>
                  Move
                </BarButton>
                <BarButton icon={Star} onClick={() => void setStar([...selected], true)}>
                  Star
                </BarButton>
                <BarButton icon={StarOff} onClick={() => void setStar([...selected], false)} className="hidden sm:inline-flex">
                  Unstar
                </BarButton>
                <BarButton icon={Trash2} danger onClick={() => void trash([...selected])}>
                  Delete
                </BarButton>
              </>
            )}
            <button
              type="button"
              aria-label="Clear selection"
              onClick={clearSelection}
              className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <MoveToFolderDialog
        open={!!moveIds}
        onOpenChange={(o) => !o && setMoveIds(null)}
        count={moveIds?.length ?? 0}
        currentFolderId={moveIds?.length === 1 ? moveCurrent : null}
        onMove={doMove}
      />
    </div>
  );
}

function BarButton({
  icon: Icon,
  children,
  onClick,
  danger,
  className,
}: {
  icon: typeof Star;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        danger ? "text-red-300 hover:bg-red-400/15" : "text-foreground hover:bg-white/10",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}
