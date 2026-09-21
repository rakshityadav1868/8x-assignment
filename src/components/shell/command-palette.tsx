"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ListVideo, Loader2, Search, Settings, Sparkles, Upload } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useTranscriptSearch } from "@/hooks/use-search";
import { ROUTES } from "@/lib/routes";
import { formatClock } from "@/lib/ui/format";

export const OPEN_PALETTE_EVENT = "fanthom:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

const NAV = [
  { label: "My Calls", href: ROUTES.pages.calls, icon: Home },
  { label: "Search all transcripts", href: ROUTES.pages.search(), icon: Search },
  { label: "Ask Fanthom across all calls", href: ROUTES.pages.ask, icon: Sparkles },
  { label: "Upload a recording", href: ROUTES.pages.upload, icon: Upload },
  { label: "Playlists", href: ROUTES.pages.playlists, icon: ListVideo },
  { label: "Settings", href: ROUTES.pages.settings, icon: Settings },
];

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-white/80 outline-none data-[selected=true]:bg-primary/15 data-[selected=true]:text-white";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, loading } = useTranscriptSearch(open ? q : "", { limit: 8, delay: 150 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const needle = q.trim();
  const hits = needle ? (data?.hits ?? []) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search Fanthom</DialogTitle>
        <DialogDescription className="sr-only">Search every transcript and jump to the moment.</DialogDescription>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
            <Search className="size-4 text-muted-foreground" />
            <CommandPrimitive.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search what was said in any call…"
              className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {loading && needle && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
          </div>
          <CommandPrimitive.List className="max-h-[min(60dvh,420px)] overflow-y-auto p-2 [scrollbar-width:thin]">
            {needle && !loading && hits.length === 0 && (
              <CommandPrimitive.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                No moments match “{needle}”.
              </CommandPrimitive.Empty>
            )}
            {hits.length > 0 && (
              <CommandPrimitive.Group
                heading="Moments"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {hits.map((h) => (
                  <CommandPrimitive.Item
                    key={h.segment_id}
                    value={h.segment_id}
                    onSelect={() => go(ROUTES.pages.callAt(h.meeting_id, h.start_ms))}
                    className={`${itemCls} items-start`}
                  >
                    <ParticipantAvatar person={{ name: h.speaker_name, color: h.speaker_color }} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        <span style={{ color: h.speaker_color ?? undefined }}>{h.speaker_name}</span> · {h.meeting_title}
                      </p>
                      <p className="line-clamp-2 text-[13px] leading-snug" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                    </div>
                    <span className="mt-0.5 rounded-md bg-primary/12 px-1.5 font-mono text-[11px] tabular-nums text-sky-300">
                      {formatClock(h.start_ms)}
                    </span>
                  </CommandPrimitive.Item>
                ))}
                {data && data.total > hits.length && (
                  <CommandPrimitive.Item value="__all" onSelect={() => go(ROUTES.pages.search(needle))} className={itemCls}>
                    <Sparkles className="size-4 text-primary" /> See all {data.total} results for “{needle}”
                  </CommandPrimitive.Item>
                )}
              </CommandPrimitive.Group>
            )}
            {!needle && (
              <CommandPrimitive.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {NAV.map((n) => (
                  <CommandPrimitive.Item key={n.href} value={n.label} onSelect={() => go(n.href)} className={itemCls}>
                    <n.icon className="size-4 text-muted-foreground" /> {n.label}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
          <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> jump to moment
            </span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
