"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Globe2,
  Loader2,
  RotateCcw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, MeetingTypeBadge } from "@/components/common/bits";
import { AvatarStack, ParticipantAvatar } from "@/components/common/participant-avatar";
import { useTimeZone } from "@/components/common/time-zone";
import { PlatformIcon, PLATFORM_META } from "@/components/record/platform";
import { SendBotDialog } from "@/components/record/send-bot-dialog";
import { ROUTES } from "@/lib/routes";
import type { CalendarEventResponse, CalendarResponse, PrefsResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, invalidate, useApi } from "@/lib/ui/use-api";
import { dayKey, timeOfDay } from "@/lib/ui/format";
import type { AutoRecordRule, CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/ui/use-now";
import { RULES } from "./rules";

export { RULES };

// ---- date helpers (YYYY-MM-DD keys in the viewer's zone) -----------------------------------------
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
}
function hourIn(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}
function dayHeading(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return {
    wd: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
    long: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

const HOUR_PX = 52;

export function CalendarView() {
  const tz = useTimeZone();
  const now = useNow();
  const todayKey = dayKey(new Date(now), tz);
  const [offset, setOffset] = useState(0);
  const monday = addDays(addDays(todayKey, -weekday(todayKey)), offset * 7);
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const { data, error, loading, reload, setData } = useApi<CalendarResponse>(
    `${ROUTES.api.calendar}?from=${monday}&to=${addDays(sunday, 1)}`,
    { tags: ["calendar"] },
  );
  const [botFor, setBotFor] = useState<CalendarEvent | null>(null);
  const [savingRule, setSavingRule] = useState<AutoRecordRule | null>(null);

  const events = useMemo(() => data?.events ?? [], [data]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.start), tz);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events, tz]);

  // Visible hour window: 8–18 by default, widened to fit events.
  const [startHour, endHour] = useMemo(() => {
    let lo = 8;
    let hi = 18;
    for (const e of events) {
      lo = Math.min(lo, Math.floor(hourIn(new Date(e.start), tz)));
      hi = Math.max(hi, Math.ceil(hourIn(new Date(e.end), tz)) || 24);
    }
    return [Math.max(0, lo), Math.min(24, hi)];
  }, [events, tz]);

  const rule = data?.auto_record_rule ?? "external_only";
  const recordCount = events.filter((e) => e.record && new Date(e.end).getTime() > now).length;

  const setRule = async (r: AutoRecordRule) => {
    setSavingRule(r);
    try {
      await api<PrefsResponse>(ROUTES.api.prefs, { method: "PATCH", json: { auto_record_rule: r } });
      toast.success("Auto-record rule updated", { description: RULES.find((x) => x.key === r)?.hint });
      invalidate("prefs");
      reload();
    } catch (e) {
      toast.error("Couldn't update the rule", { description: errorMessage(e) });
    } finally {
      setSavingRule(null);
    }
  };

  const setRecord = async (ev: CalendarEvent, record: boolean | null) => {
    const prev = data;
    setData((d) =>
      d
        ? {
            ...d,
            events: d.events.map((e) => (e.id === ev.id ? { ...e, record_override: record, record: record ?? e.record } : e)),
          }
        : d,
    );
    try {
      const r = await api<CalendarEventResponse>(ROUTES.api.calendarEvent(ev.id), { method: "PATCH", json: { record } });
      setData((d) => (d ? { ...d, events: d.events.map((e) => (e.id === ev.id ? r.event : e)) } : d));
      toast.success(
        record === null ? "Following your auto-record rule" : record ? "Fanthom will record this meeting" : "Fanthom will skip this meeting",
        { description: ev.title },
      );
    } catch (e) {
      setData(prev);
      toast.error("Couldn't update", { description: errorMessage(e) });
    }
  };

  const rangeLabel = (() => {
    const a = new Date(`${monday}T12:00:00Z`);
    const b = new Date(`${sunday}T12:00:00Z`);
    const sameMonth = a.getUTCMonth() === b.getUTCMonth();
    const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
    return sameMonth
      ? `${f(a, { month: "long", day: "numeric" })} – ${b.getUTCDate()}, ${b.getUTCFullYear()}`
      : `${f(a, { month: "short", day: "numeric" })} – ${f(b, { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Calendar</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {loading ? "Loading your week…" : `${recordCount} upcoming meeting${recordCount === 1 ? "" : "s"} set to record.`}
            <span
              title="Calendar OAuth is stubbed: events are seeded. Record toggles and the auto-record rule are saved for real."
              className="inline-flex h-5 cursor-help items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/8 px-2 text-[10px] font-medium uppercase tracking-wider text-amber-200/90"
            >
              <FlaskConical className="size-3" /> {data?.calendar_connected ? "Demo calendar" : "Calendar sync simulated"}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Auto-record</span>
          <div role="radiogroup" aria-label="Auto-record rule" className="flex overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1 [scrollbar-width:none]">
            {RULES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={rule === r.key}
                title={r.hint}
                disabled={!!savingRule || loading}
                onClick={() => rule !== r.key && setRule(r.key)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default",
                  rule === r.key && "bg-white text-neutral-950 hover:text-neutral-950",
                )}
              >
                {savingRule === r.key && <Loader2 className="size-3 animate-spin" />}
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setOffset(0)} disabled={offset === 0}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight />
        </Button>
        <p className="ml-1 text-sm font-medium">{rangeLabel}</p>
      </div>

      <div className="mt-4">
        {loading ? (
          <CalendarSkeleton />
        ) : error && !data ? (
          <div className="glass rounded-2xl">
            <ErrorState title="Couldn't load your calendar" description={errorMessage(error)} onRetry={reload} />
          </div>
        ) : (
          <>
            {/* Week grid (md+) */}
            <div className="glass hidden overflow-hidden rounded-2xl md:block">
              <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-white/[0.06]">
                <div />
                {days.map((k) => {
                  const h = dayHeading(k);
                  const today = k === todayKey;
                  return (
                    <div key={k} className="border-l border-white/[0.06] px-2 py-2.5 text-center">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{h.wd}</span>
                      <span
                        className={cn(
                          "mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-medium",
                          today && "bg-primary text-white shadow-[0_0_14px_var(--brand)]",
                        )}
                      >
                        {h.day}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="max-h-[70dvh] overflow-y-auto">
                <div
                  className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]"
                  style={{ height: (endHour - startHour) * HOUR_PX }}
                >
                  <div className="relative">
                    {Array.from({ length: endHour - startHour }, (_, i) => (
                      <span
                        key={i}
                        className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground/70"
                        style={{ top: i * HOUR_PX }}
                      >
                        {i === 0 ? "" : `${((startHour + i + 11) % 12) + 1} ${startHour + i < 12 ? "AM" : "PM"}`}
                      </span>
                    ))}
                  </div>
                  {days.map((k) => (
                    <div key={k} className={cn("relative border-l border-white/[0.06]", k === todayKey && "bg-primary/[0.03]")}>
                      {Array.from({ length: endHour - startHour }, (_, i) => (
                        <div key={i} className="absolute inset-x-0 border-t border-white/[0.04]" style={{ top: i * HOUR_PX }} />
                      ))}
                      {k === todayKey && <NowLine startHour={startHour} tz={tz} now={now} />}
                      {layoutDay(byDay.get(k) ?? [], tz).map(({ ev, col, cols }) => {
                        const s = hourIn(new Date(ev.start), tz);
                        const e = Math.max(s + 0.33, hourIn(new Date(ev.end), tz) || 24);
                        return (
                          <EventPopover key={ev.id} ev={ev} onRecord={setRecord} onJoin={setBotFor}>
                            <button
                              type="button"
                              className={cn(
                                "absolute overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors",
                                ev.record
                                  ? "border-primary/40 bg-primary/15 hover:bg-primary/25"
                                  : "border-white/10 bg-white/[0.05] text-muted-foreground hover:bg-white/[0.09]",
                                new Date(ev.end).getTime() < now && "opacity-55",
                              )}
                              style={{
                                top: (s - startHour) * HOUR_PX + 1,
                                height: (e - s) * HOUR_PX - 2,
                                left: `calc(${(col / cols) * 100}% + 2px)`,
                                width: `calc(${100 / cols}% - 4px)`,
                              }}
                            >
                              <span className="flex items-center gap-1">
                                {ev.record && <span className="size-1.5 shrink-0 rounded-full bg-red-400" aria-label="Will record" />}
                                <span className="truncate font-medium text-foreground">{ev.title}</span>
                              </span>
                              <span className="block truncate text-muted-foreground" suppressHydrationWarning>
                                {timeOfDay(new Date(ev.start), tz)}
                                {ev.is_external && " · External"}
                              </span>
                            </button>
                          </EventPopover>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* List (mobile) */}
            <div className="flex flex-col gap-6 md:hidden">
              {events.length === 0 && (
                <div className="glass rounded-2xl">
                  <EmptyState icon={CalendarDays} title="No meetings this week" description="Upcoming meetings from your calendar show up here." />
                </div>
              )}
              {days
                .filter((k) => byDay.get(k)?.length)
                .map((k) => (
                  <section key={k}>
                    <h2 className={cn("mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80", k === todayKey && "text-sky-300")}>
                      {k === todayKey ? "Today" : dayHeading(k).long}
                    </h2>
                    <ul className="glass divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
                      {byDay.get(k)!.map((ev) => (
                        <EventRow key={ev.id} ev={ev} onRecord={setRecord} onJoin={setBotFor} />
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
            {events.length === 0 && (
              <p className="mt-4 hidden text-center text-sm text-muted-foreground md:block">No meetings this week.</p>
            )}
          </>
        )}
      </div>

      <SendBotDialog
        open={!!botFor}
        onOpenChange={(o) => !o && setBotFor(null)}
        initialUrl={botFor?.meeting_url}
        initialTitle={botFor?.title}
      />
    </div>
  );
}

/** Side-by-side columns for overlapping events. */
function layoutDay(events: CalendarEvent[], tz: string) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const out: { ev: CalendarEvent; col: number; cols: number }[] = [];
  let cluster: { ev: CalendarEvent; col: number; end: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ ev: c.ev, col: c.col, cols });
    cluster = [];
  };
  for (const ev of sorted) {
    const s = hourIn(new Date(ev.start), tz);
    const e = hourIn(new Date(ev.end), tz) || 24;
    if (s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > s).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ev, col, end: e });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

function NowLine({ startHour, tz, now }: { startHour: number; tz: string; now: number }) {
  const h = hourIn(new Date(now), tz);
  if (h < startHour) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (h - startHour) * HOUR_PX }}>
      <span className="-ml-1 size-2 rounded-full bg-red-400" />
      <span className="h-px flex-1 bg-red-400/70" />
    </div>
  );
}

function RecordControl({ ev, onRecord }: { ev: CalendarEvent; onRecord: (ev: CalendarEvent, r: boolean | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      {ev.record_override !== null && (
        <button
          type="button"
          onClick={() => onRecord(ev, null)}
          title="Follow the auto-record rule again"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" /> Rule
        </button>
      )}
      <Switch
        checked={ev.record}
        onCheckedChange={(c) => onRecord(ev, c)}
        aria-label={ev.record ? `Don't record ${ev.title}` : `Record ${ev.title}`}
      />
    </div>
  );
}

function EventDetails({
  ev,
  onRecord,
  onJoin,
}: {
  ev: CalendarEvent;
  onRecord: (ev: CalendarEvent, r: boolean | null) => void;
  onJoin: (ev: CalendarEvent) => void;
}) {
  const tz = useTimeZone();
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const past = e.getTime() < useNow();
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-sm font-semibold leading-snug">{ev.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" suppressHydrationWarning>
          <Clock className="size-3" />
          {s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })} · {timeOfDay(s, tz)}–
          {timeOfDay(e, tz)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <MeetingTypeBadge type={ev.meeting_type} />
        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-white/10 px-2 text-[11px] text-muted-foreground">
          <PlatformIcon platform={ev.platform} className="size-3.5 rounded-sm text-[7px]" /> {PLATFORM_META[ev.platform].label}
        </span>
        {ev.is_external && (
          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/8 px-2 text-[11px] text-amber-200">
            <Globe2 className="size-3" /> External
          </span>
        )}
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="size-3" /> {ev.attendees.length} attendees
        </p>
        <ul className="grid max-h-36 gap-1 overflow-y-auto">
          {ev.attendees.map((a, i) => (
            <li key={`${a.email ?? a.name}-${i}`} className="flex items-center gap-2 text-xs">
              <ParticipantAvatar person={{ name: a.name, color: a.is_external ? "#fbbf24" : "#60a5fa" }} size="xs" />
              <span className="truncate">{a.name}</span>
              {a.is_external && <span className="text-[10px] text-muted-foreground">external</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <span className="text-xs">
          {ev.record ? "Fanthom will record" : "Not recording"}
          <span className="block text-[10px] text-muted-foreground">
            {ev.record_override === null ? "Following your auto-record rule" : "Set manually for this meeting"}
          </span>
        </span>
        <RecordControl ev={ev} onRecord={onRecord} />
      </div>
      {!past && (
        <Button
          onClick={() => onJoin(ev)}
          disabled={!ev.meeting_url}
          title={ev.meeting_url ? undefined : "This event has no meeting link"}
          className="rounded-full bg-white text-neutral-950 hover:bg-white/90"
        >
          <Bot /> Join & record now
        </Button>
      )}
    </div>
  );
}

function EventPopover({
  ev,
  onRecord,
  onJoin,
  children,
}: {
  ev: CalendarEvent;
  onRecord: (ev: CalendarEvent, r: boolean | null) => void;
  onJoin: (ev: CalendarEvent) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80">
        <EventDetails
          ev={ev}
          onRecord={onRecord}
          onJoin={(e) => {
            setOpen(false);
            onJoin(e);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function EventRow({
  ev,
  onRecord,
  onJoin,
}: {
  ev: CalendarEvent;
  onRecord: (ev: CalendarEvent, r: boolean | null) => void;
  onJoin: (ev: CalendarEvent) => void;
}) {
  const tz = useTimeZone();
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const past = e.getTime() < useNow();
  return (
    <li className={cn("flex items-start gap-3 p-3.5", past && "opacity-60")}>
      <div className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>
        {timeOfDay(s, tz)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{ev.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <PlatformIcon platform={ev.platform} className="size-4 rounded text-[8px]" />
          <span suppressHydrationWarning>{Math.round((e.getTime() - s.getTime()) / 60000)} min</span>
          {ev.is_external && <span className="rounded-full border border-amber-300/20 px-1.5 text-amber-200">External</span>}
          <AvatarStack people={ev.attendees} max={3} size="xs" className="ml-1" />
        </div>
        {!past && ev.meeting_url && (
          <button type="button" onClick={() => onJoin(ev)} className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
            <CalendarCheck className="size-3.5" /> Join & record
          </button>
        )}
      </div>
      <RecordControl ev={ev} onRecord={onRecord} />
    </li>
  );
}

function CalendarSkeleton() {
  return (
    <div className="glass rounded-2xl p-4" aria-busy aria-label="Loading calendar">
      <div className="hidden grid-cols-7 gap-3 md:grid">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="mx-auto h-4 w-10" />
            <Skeleton className="h-16 w-full" style={{ marginTop: (i % 3) * 30 }} />
            {i % 2 === 0 && <Skeleton className="h-10 w-full" />}
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
