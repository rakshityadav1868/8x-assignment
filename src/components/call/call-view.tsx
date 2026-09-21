"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TranscriptPanel } from "@/components/transcript/transcript-panel";
import { SummaryPanel } from "@/components/summary/summary-panel";
import { ActionItemsPanel } from "@/components/summary/action-items-panel";
import { AskPanel } from "@/components/summary/ask-panel";
import { PlayerProvider, usePlayerStore } from "@/hooks/use-player";
import type { AiMode, MeetingDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ApiClientError, api } from "@/lib/ui/api";
import { CallProvider, useCall, type CallTab } from "./call-context";
import { CallExtrasProvider, useCallExtras } from "./call-extras";
import { CoachingPanel } from "./coaching-panel";
import { CommentsPanel } from "./comments-panel";
import { CallHeader } from "./call-header";
import { MediaStage } from "./media-stage";
import { PlayerControls } from "./player-controls";
import { CallTimeline } from "./timeline";

export function CallView({
  detail,
  aiMode,
  initialSeconds,
  readOnly = false,
  shareMode = false,
  fullHeightClass = "lg:h-[calc(100dvh-3.5rem)]",
  syncUrl,
  onSyncError,
}: {
  detail: MeetingDetail;
  aiMode: AiMode;
  initialSeconds?: number | null;
  readOnly?: boolean;
  shareMode?: boolean;
  fullHeightClass?: string;
  /** When set, re-fetch MeetingDetail from this API URL after hydration and merge it (API is the source of truth). */
  syncUrl?: string | null;
  onSyncError?: (err: ApiClientError) => void;
}) {
  const durationMs = Math.max(detail.meeting.duration_sec * 1000, detail.segments.at(-1)?.end_ms ?? 0);
  return (
    <PlayerProvider durationMs={durationMs} virtual={!detail.meeting.media_url}>
      <CallProvider
        detail={detail}
        aiMode={aiMode}
        initialTab={initialSeconds != null ? "transcript" : "summary"}
        readOnly={readOnly}
        shareMode={shareMode}
      >
        <CallExtrasProvider>
          <CallLayout initialSeconds={initialSeconds ?? null} fullHeightClass={fullHeightClass} />
          {syncUrl && <ApiSync url={syncUrl} onError={onSyncError} />}
        </CallExtrasProvider>
      </CallProvider>
    </PlayerProvider>
  );
}

function ApiSync({ url, onError }: { url: string; onError?: (err: ApiClientError) => void }) {
  const { reconcile } = useCall();
  useEffect(() => {
    const ctrl = new AbortController();
    api<MeetingDetail>(url, { signal: ctrl.signal, cache: "no-store" })
      .then(reconcile)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && e instanceof ApiClientError) onError?.(e);
      });
    return () => ctrl.abort();
  }, [url, reconcile, onError]);
  return null;
}

function CallLayout({ initialSeconds, fullHeightClass }: { initialSeconds: number | null; fullHeightClass: string }) {
  const { meeting, detail, highlights, participants, segments, tab, setTab, actionItems, readOnly, shareMode } = useCall();
  const store = usePlayerStore();
  const [captions, setCaptions] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // ?t=<sec> deep links (also re-applied when the palette navigates to another moment of this call).
  useEffect(() => {
    if (initialSeconds == null) return;
    store.seek(initialSeconds * 1000);
    setTab("transcript");
  }, [initialSeconds, store, setTab]);

  const openHelp = useCallback(() => setShortcutsOpen(true), []);
  const tabsRef = useRef<HTMLDivElement>(null);
  const panelWidth = useElementWidth(tabsRef);
  // Tabs that don't fit the panel go into a "More" menu (Summary/Transcript/Action items always stay visible).
  const compact = !!panelWidth && panelWidth < 560;
  const overflow = useMemo<CallTab[]>(() => {
    if (!panelWidth || panelWidth >= 560) return [];
    if (readOnly) return panelWidth < 400 ? ["comments"] : [];
    if (panelWidth < 440) return shareMode ? ["ask", "comments"] : ["ask", "comments", "coaching"];
    return shareMode ? [] : ["coaching"];
  }, [panelWidth, readOnly, shareMode]);
  useKeyboardShortcuts(openHelp);

  const openItems = actionItems.filter((a) => !a.completed).length;

  return (
    <div className={cn("mx-auto flex w-full max-w-[1680px] flex-col px-4 py-4 md:px-6 lg:overflow-hidden", fullHeightClass)}>
      <CallHeader onShowShortcuts={openHelp} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="min-w-0 space-y-2 lg:col-start-1 lg:row-start-1">
          <MediaStage
            mediaUrl={meeting.media_url}
            mediaKind={meeting.media_kind}
            participants={participants}
            segments={segments}
            chapters={detail.chapters}
            showCaptions={captions}
            className="lg:max-h-[52dvh]"
          />
          <PlayerControls
            chapters={detail.chapters}
            highlights={highlights}
            captions={captions}
            onToggleCaptions={() => setCaptions((c) => !c)}
          />
        </div>

        {/* DOM order matches the mobile visual order (no `order-*`), so a partially streamed page never paints the
            timeline above where the tabs panel will land; desktop placement is explicit grid rows/cols. */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as CallTab)}
          ref={tabsRef}
          className="glass flex h-[72dvh] min-h-0 flex-col gap-0 overflow-hidden rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto"
        >
          <TabsList
            variant="line"
            data-compact={compact}
            className="group/tl h-11! w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-white/[0.06] px-1 [scrollbar-width:none] sm:px-2 data-[compact=true]:px-1"
          >
            <PanelTab value="summary">Summary</PanelTab>
            <PanelTab value="transcript">Transcript</PanelTab>
            <PanelTab value="actions">
              {compact ? "Actions" : "Action items"}
              {openItems > 0 && (
                <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-white/80">{openItems}</span>
              )}
            </PanelTab>
            {!readOnly && !overflow.includes("ask") && <PanelTab value="ask">Ask</PanelTab>}
            {/* Wide panels show every tab; narrow ones fold the tail into "More". */}
            {!overflow.includes("comments") && (
              <PanelTab value="comments">
                Comments
                {!compact && <CommentCount />}
              </PanelTab>
            )}
            {!shareMode && !overflow.includes("coaching") && <PanelTab value="coaching">Coaching</PanelTab>}
            {overflow.length > 0 && <MoreTabs tab={tab} setTab={setTab} items={overflow} />}
          </TabsList>
          <TabsContent value="summary" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <SummaryPanel />
          </TabsContent>
          <TabsContent value="transcript" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <TranscriptPanel active={tab === "transcript"} />
          </TabsContent>
          <TabsContent value="actions" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <ActionItemsPanel />
          </TabsContent>
          {!readOnly && (
            <TabsContent value="ask" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
              <AskPanel active={tab === "ask"} />
            </TabsContent>
          )}
          <TabsContent value="comments" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
            <CommentsPanel active={tab === "comments"} />
          </TabsContent>
          {!shareMode && (
            <TabsContent value="coaching" className="min-h-0 flex-1">
              <CoachingPanel active={tab === "coaching"} />
            </TabsContent>
          )}
        </Tabs>

        <div className="min-h-0 lg:col-start-1 lg:row-start-2 lg:overflow-y-auto lg:pb-2 [scrollbar-width:thin]">
          <CallTimeline />
        </div>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

const TAB_CLASS =
  "h-full flex-none rounded-none px-2.5 text-[13px] sm:px-3 text-white/55 after:bottom-0! after:bg-sky-400! after:shadow-[0_0_10px_rgba(56,189,248,0.8)] data-active:text-white";

function PanelTab({ value, children, className }: { value: CallTab; children: React.ReactNode; className?: string }) {
  return (
    <TabsTrigger value={value} className={cn(TAB_CLASS, "group-data-[compact=true]/tl:px-2", className)}>
      {children}
    </TabsTrigger>
  );
}

function CommentCount() {
  const { comments } = useCallExtras();
  const n = comments.status === "ready" ? comments.data.length : 0;
  if (!n) return null;
  return <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-white/80">{n}</span>;
}

const TAB_LABEL: Partial<Record<CallTab, string>> = { ask: "Ask", comments: "Comments", coaching: "Coaching" };

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function MoreTabs({ tab, setTab, items }: { tab: CallTab; setTab: (t: CallTab) => void; items: CallTab[] }) {
  const activeOverflow = items.includes(tab) ? TAB_LABEL[tab] : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-full shrink-0 items-center gap-1 px-2 text-[13px] font-medium text-white/55 hover:text-white",
            activeOverflow &&
              "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-sky-400 after:shadow-[0_0_10px_rgba(56,189,248,0.8)]",
          )}
        >
          {activeOverflow ?? "More"} <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => setTab(t)}>
            {TAB_LABEL[t]} {t === "comments" && <CommentCount />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function useKeyboardShortcuts(onHelp: () => void) {
  const store = usePlayerStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (document.querySelector("[role=dialog],[role=menu],[role=listbox]")) return;
      const k = e.key;
      if (k === " " || k === "k" || k === "K") {
        e.preventDefault(); // also stops a focused button from "clicking" on Space
        store.toggle();
      } else if (k === "j" || k === "J") {
        store.skip(-10_000);
      } else if (k === "l" || k === "L") {
        store.skip(10_000);
      } else if (k === "ArrowLeft") {
        store.skip(-5_000);
      } else if (k === "ArrowRight") {
        store.skip(5_000);
      } else if (k === ">" || k === ".") {
        if (k === "." && !e.shiftKey) return;
        const r = store.cycleRate(1);
        toast(`Playback speed ${r}×`, { id: "rate", duration: 1000 });
      } else if (k === "<" || k === ",") {
        if (k === "," && !e.shiftKey) return;
        const r = store.cycleRate(-1);
        toast(`Playback speed ${r}×`, { id: "rate", duration: 1000 });
      } else if (k === "?") {
        onHelp();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, onHelp]);
}

const SHORTCUTS: [string[], string][] = [
  [["Space"], "Play / pause"],
  [["K"], "Play / pause"],
  [["J"], "Back 10 seconds"],
  [["L"], "Forward 10 seconds"],
  [["←", "→"], "Back / forward 5 seconds"],
  [["Shift", ">"], "Faster"],
  [["Shift", "<"], "Slower"],
  [["⌘", "K"], "Search every call"],
  [["?"], "Show shortcuts"],
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Keep your hands on the keys while you review a call.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-white/[0.06]">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label + keys.join()} className="flex items-center justify-between py-2 text-sm">
              <span className="text-white/80">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 font-mono text-[11px]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
