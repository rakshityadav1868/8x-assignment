"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ChevronDown, ChevronUp, Copy, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, HIGHLIGHT_META } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useCall } from "@/components/call/call-context";
import { usePlayer, usePlayerStore, indexAt } from "@/hooks/use-player";
import { ROUTES, type HighlightResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import { escapeRegExp, firstName, formatClock } from "@/lib/ui/format";
import { HIGHLIGHT_TYPES, type HighlightType, type Participant, type TranscriptSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Row {
  seg: TranscriptSegment;
  orig: number; // index into the full segments array
  header: boolean; // speaker changed → show avatar + name
}

export function TranscriptPanel({ active }: { active: boolean }) {
  const { segments, participantById, participants, speakerFilter, setSpeakerFilter, highlights, readOnly } = useCall();
  const store = usePlayerStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [autoSync, setAutoSync] = useState(true);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: string | null | undefined;
    let prevEnd = 0;
    segments.forEach((seg, orig) => {
      if (speakerFilter && seg.participant_id !== speakerFilter) return;
      const header = seg.participant_id !== prev || seg.start_ms - prevEnd > 60_000 || !!speakerFilter;
      out.push({ seg, orig, header });
      prev = seg.participant_id;
      prevEnd = seg.end_ms;
    });
    return out;
  }, [segments, speakerFilter]);

  // Highlight tags per segment (first highlight that starts inside the segment).
  const tagsByOrig = useMemo(() => {
    const m = new Map<number, HighlightType[]>();
    for (const h of highlights) {
      const i = indexAt(segments, h.start_ms);
      if (i < 0) continue;
      m.set(i, [...(m.get(i) ?? []), h.type]);
    }
    return m;
  }, [highlights, segments]);

  const needle = query.trim();
  const matchRe = useMemo(() => (needle ? new RegExp(escapeRegExp(needle), "gi") : null), [needle]);
  const matches = useMemo(() => {
    if (!needle) return [] as number[];
    const lower = needle.toLowerCase();
    const out: number[] = [];
    rows.forEach((r, i) => {
      if (r.seg.text.toLowerCase().includes(lower)) out.push(i);
    });
    return out;
  }, [rows, needle]);
  const currentMatchRow = matches.length ? matches[Math.min(cursor, matches.length - 1)] : -1;

  const currentOrig = usePlayer((s) => indexAt(segments, s.currentMs));
  const activeRow = useMemo(() => {
    if (currentOrig < 0) return -1;
    // last row whose orig <= currentOrig
    let lo = 0;
    let hi = rows.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].orig <= currentOrig) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 && rows[ans].orig === currentOrig ? ans : -1;
  }, [rows, currentOrig]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.header ? 84 : 52),
    overscan: 10,
    getItemKey: (i) => rows[i]?.seg.id ?? i,
  });

  const scrollToRow = useCallback(
    (row: number, smooth = true) => {
      const el = scrollRef.current;
      if (!el || row < 0) return;
      const res = virtualizer.getOffsetForIndex(row, "center");
      if (!res) return;
      const [offset] = res;
      if (smooth && Math.abs(el.scrollTop - offset) < el.clientHeight * 3) el.scrollTo({ top: offset, behavior: "smooth" });
      else virtualizer.scrollToIndex(row, { align: "center" });
    },
    [virtualizer],
  );

  // Follow playback.
  useEffect(() => {
    if (!active || !autoSync || activeRow < 0) return;
    scrollToRow(activeRow);
  }, [active, autoSync, activeRow, scrollToRow]);

  // Jump to current search match.
  useEffect(() => {
    if (currentMatchRow >= 0) scrollToRow(currentMatchRow, false);
  }, [currentMatchRow, scrollToRow]);

  // Re-center when the tab becomes visible or the filter changes.
  useEffect(() => {
    if (active && autoSync && activeRow >= 0) {
      requestAnimationFrame(() => scrollToRow(activeRow, false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, speakerFilter]);

  const pauseSync = useCallback(() => setAutoSync(false), []);

  const onSeek = useCallback(
    (seg: TranscriptSegment) => {
      store.seek(seg.start_ms);
      setAutoSync(true);
    },
    [store],
  );

  const copyTranscript = async () => {
    const text = segments
      .map((s) => `[${formatClock(s.start_ms)}] ${participantById.get(s.participant_id ?? "")?.name ?? "Unknown"}: ${s.text}`)
      .join("\n");
    if (await copyText(text)) toast.success("Transcript copied", { description: `${segments.length} lines` });
  };

  const talkers = useMemo(() => {
    const ids = new Set(segments.map((s) => s.participant_id));
    return participants.filter((p) => ids.has(p.id));
  }, [participants, segments]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="space-y-2 border-b border-white/[0.06] px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
                if (e.target.value) setAutoSync(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length) {
                  e.preventDefault();
                  setCursor((c) => (e.shiftKey ? (c - 1 + matches.length) % matches.length : (c + 1) % matches.length));
                }
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search transcript"
              aria-label="Search transcript"
              className="h-8 w-full rounded-lg border border-white/8 bg-white/[0.04] pl-8 pr-24 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
            {needle && (
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <span className="px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {matches.length ? `${Math.min(cursor, matches.length - 1) + 1}/${matches.length}` : "0/0"}
                </span>
                <button
                  type="button"
                  aria-label="Previous match"
                  disabled={!matches.length}
                  onClick={() => setCursor((c) => (c - 1 + matches.length) % matches.length)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-40"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Next match"
                  disabled={!matches.length}
                  onClick={() => setCursor((c) => (c + 1) % matches.length)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-40"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copyTranscript}
                aria-label="Copy transcript"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <Copy className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy transcript</TooltipContent>
          </Tooltip>
        </div>
        {talkers.length > 1 && (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
            <SpeakerChip label="All" active={!speakerFilter} onClick={() => setSpeakerFilter(null)} />
            {talkers.map((p) => (
              <SpeakerChip
                key={p.id}
                person={p}
                label={firstName(p.name)}
                active={speakerFilter === p.id}
                onClick={() => setSpeakerFilter(speakerFilter === p.id ? null : p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-color:rgba(255,255,255,0.12)_transparent] [scrollbar-width:thin]"
          onWheel={pauseSync}
          onTouchMove={pauseSync}
          onKeyDown={(e) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) pauseSync();
          }}
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={Search}
              title={segments.length === 0 ? "No transcript yet" : "Nothing from this speaker"}
              description={segments.length === 0 ? "The transcript appears here once processing finishes." : undefined}
            />
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const r = rows[vi.index];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <TranscriptRow
                      row={r}
                      speaker={r.seg.participant_id ? participantById.get(r.seg.participant_id) : undefined}
                      active={vi.index === activeRow}
                      matchRe={matchRe}
                      isCurrentMatch={vi.index === currentMatchRow}
                      tags={tagsByOrig.get(r.orig)}
                      readOnly={readOnly}
                      onSeek={onSeek}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!autoSync && rows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAutoSync(true);
              setQuery("");
              if (activeRow >= 0) scrollToRow(activeRow);
            }}
            className="animate-rise absolute bottom-4 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white pl-3 pr-3.5 text-xs font-medium text-neutral-950 shadow-[0_8px_30px_-6px_rgba(59,130,246,0.7)] hover:bg-sky-50"
          >
            <ArrowDown className="size-3.5" /> Resume sync
          </button>
        )}
      </div>
    </div>
  );
}

function SpeakerChip({
  label,
  person,
  active,
  onClick,
}: {
  label: string;
  person?: Participant;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        person && "pl-1",
        active
          ? "border-sky-400/40 bg-primary/20 text-white"
          : "border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      {person && <ParticipantAvatar person={person} size="xs" />}
      {label}
    </button>
  );
}

function Highlighted({ text, re, strong }: { text: string; re: RegExp | null; strong: boolean }) {
  if (!re) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className={strong ? "!bg-sky-400/60 !text-white" : undefined}>
        {m[0]}
      </mark>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const TranscriptRow = memo(function TranscriptRow({
  row,
  speaker,
  active,
  matchRe,
  isCurrentMatch,
  tags,
  readOnly,
  onSeek,
}: {
  row: Row;
  speaker?: Participant;
  active: boolean;
  matchRe: RegExp | null;
  isCurrentMatch: boolean;
  tags?: HighlightType[];
  readOnly: boolean;
  onSeek: (seg: TranscriptSegment) => void;
}) {
  const { seg } = row;
  const hasMatch = matchRe ? new RegExp(matchRe.source, "i").test(seg.text) : false;
  return (
    <div className={cn("px-3", row.header ? "pt-3" : "pt-0.5")}>
      {row.header && (
        <div className="mb-1 flex items-center gap-2">
          {speaker ? (
            <ParticipantAvatar person={speaker} size="sm" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-[10px]">?</span>
          )}
          <span className="text-[13px] font-medium" style={{ color: speaker?.color }}>
            {speaker?.name ?? "Unknown speaker"}
          </span>
          <button
            type="button"
            onClick={() => onSeek(seg)}
            className="font-mono text-[11px] tabular-nums text-muted-foreground hover:text-sky-300"
          >
            {formatClock(seg.start_ms)}
          </button>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSeek(seg)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSeek(seg);
        }}
        className={cn(
          "group/row relative ml-8 cursor-pointer rounded-lg py-1.5 pl-2.5 pr-8 text-[13.5px] leading-relaxed transition-colors",
          active
            ? "bg-sky-400/[0.13] text-white shadow-[inset_2px_0_0_0_#60a5fa,0_0_0_1px_rgba(96,165,250,0.18)]"
            : "text-white/72 hover:bg-white/[0.04] hover:text-white/95",
          hasMatch && !active && "bg-white/[0.03]",
          isCurrentMatch && "ring-1 ring-sky-400/50",
        )}
      >
        {!row.header && (
          <span className="pointer-events-none absolute -left-9 top-2 w-8 text-right font-mono text-[10px] tabular-nums text-white/0 transition-colors group-hover/row:text-white/40">
            {formatClock(seg.start_ms)}
          </span>
        )}
        <Highlighted text={seg.text} re={matchRe} strong={isCurrentMatch} />
        {tags && tags.length > 0 && (
          <span className="ml-1.5 inline-flex translate-y-[1px] gap-0.5 align-baseline">
            {tags.map((t, i) => {
              const Icon = HIGHLIGHT_META[t].icon;
              return (
                <span
                  key={i}
                  title={HIGHLIGHT_META[t].label}
                  className="inline-flex size-4 items-center justify-center rounded-full"
                  style={{ color: HIGHLIGHT_META[t].color, backgroundColor: `${HIGHLIGHT_META[t].color}22` }}
                >
                  <Icon className="size-2.5" />
                </span>
              );
            })}
          </span>
        )}
        {!readOnly && <AddHighlight seg={seg} />}
      </div>
    </div>
  );
});

function AddHighlight({ seg }: { seg: TranscriptSegment }) {
  const { meeting, setHighlights } = useCall();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<HighlightType | null>(null);

  const create = async (type: HighlightType) => {
    setSaving(type);
    try {
      const title = seg.text.length > 90 ? `${seg.text.slice(0, 87).trimEnd()}…` : seg.text;
      const res = await api<HighlightResponse>(ROUTES.api.highlights(meeting.id), {
        method: "POST",
        json: { start_ms: seg.start_ms, end_ms: Math.max(seg.end_ms, seg.start_ms + 1000), type, title },
      });
      setHighlights((prev) => [...prev, res.highlight].sort((a, b) => a.start_ms - b.start_ms));
      setOpen(false);
      const url = `${window.location.origin}${ROUTES.pages.clip(res.highlight.share_token)}`;
      toast.success(`${HIGHLIGHT_META[type].label} highlight saved`, {
        description: `Clip at ${formatClock(seg.start_ms)}`,
        action: {
          label: "Copy clip link",
          onClick: () => {
            void copyText(url).then(() => toast.success("Clip link copied"));
          },
        },
      });
    } catch (e) {
      toast.error("Couldn't save highlight", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Create highlight"
          className={cn(
            "absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border border-white/10 bg-[#0d1426] text-white/70 opacity-0 transition-opacity hover:border-sky-400/50 hover:text-sky-300 focus-visible:opacity-100 group-hover/row:opacity-100",
            open && "opacity-100",
          )}
        >
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5" onClick={(e) => e.stopPropagation()}>
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Highlight as
        </p>
        {HIGHLIGHT_TYPES.map((t) => {
          const meta = HIGHLIGHT_META[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              type="button"
              disabled={!!saving}
              onClick={() => create(t)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.07] disabled:opacity-50"
            >
              <span
                className="flex size-5 items-center justify-center rounded-full"
                style={{ color: meta.color, backgroundColor: `${meta.color}22` }}
              >
                <Icon className="size-3" />
              </span>
              {meta.label}
              {saving === t && <span className="ml-auto text-[11px] text-muted-foreground">Saving…</span>}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
