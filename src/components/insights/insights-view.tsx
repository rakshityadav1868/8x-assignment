"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Radar, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { apiErrorMessage, useApi } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { InsightsResponse } from "@/lib/contracts";
import type { InsightsRange, InsightsWeekPoint, MeetingType, PersonInsights } from "@/lib/types";
import { MEETING_TYPE_LABELS } from "@/lib/templates";
import { shortDate } from "@/lib/ui/time-ago";
import { cn } from "@/lib/utils";
import { DashCard, InlineBar, Kpi, PageHeader, PageShell, Segmented } from "./dash-ui";

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All" },
];

const TYPE_COLORS: Record<MeetingType, string> = {
  sales: "#34d399",
  customer_success: "#2dd4bf",
  standup: "#fbbf24",
  one_on_one: "#f472b6",
  interview: "#a78bfa",
  project_update: "#38bdf8",
  planning: "#3b82f6",
  qa: "#fb923c",
  general: "#94a3b8",
};

function fmtMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}

export function InsightsView() {
  const [range, setRange] = useState<InsightsRange>("30d");
  const [internalOnly, setInternalOnly] = useState(true);
  const url = `${ROUTES.api.insights}?${new URLSearchParams({ range, internal_only: String(internalOnly) })}`;
  const q = useApi<InsightsResponse>(url);
  const d = q.data;

  return (
    <PageShell>
      <PageHeader
        title="Insights"
        description="How your team spends time in meetings — and how the conversations go."
        actions={<Segmented value={range} options={RANGES} onChange={setRange} ariaLabel="Date range" />}
      />

      {q.error && !d ? (
        <DashCard className="mt-8">
          <ErrorState title="Couldn't load insights" description={apiErrorMessage(q.error)} onRetry={q.reload} />
        </DashCard>
      ) : !d ? (
        <InsightsSkeleton />
      ) : d.totals.meetings === 0 ? (
        <DashCard className="mt-8">
          <EmptyState
            icon={BarChart3}
            title="No meetings in this range"
            description="Try a longer range, or record a call to start seeing trends."
            action={
              <button type="button" onClick={() => setRange("all")} className="text-sm text-sky-300 hover:underline">
                Show all time
              </button>
            }
          />
        </DashCard>
      ) : (
        <div className={cn("mt-8 space-y-4 transition-opacity", q.loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Meetings" value={d.totals.meetings} sub={`${d.totals.external_meetings} external`} />
            <Kpi label="Hours recorded" value={d.totals.hours_recorded.toFixed(1)} sub="Across all calls" />
            <Kpi label="Avg length" value={`${Math.round(d.totals.avg_duration_min)} min`} sub="Per meeting" />
            <Kpi
              label="External share"
              value={`${Math.round((d.totals.external_meetings / Math.max(1, d.totals.meetings)) * 100)}%`}
              sub="With customers or candidates"
            />
            <Kpi label="Action items" value={d.totals.action_items} sub={`${d.totals.open_action_items} still open`} />
            <Kpi label="Highlights" value={d.totals.highlights} sub="Clips worth sharing" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DashCard
              title="Meetings per week"
              action={
                <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-blue-500" /> Meetings
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full bg-emerald-300" /> Hours
                  </span>
                </span>
              }
            >
              <WeeklyChart weeks={d.weekly} />
            </DashCard>
            <DashCard title="Meeting mix">
              <TypeMix types={d.by_type} total={d.totals.meetings} />
            </DashCard>
          </div>

          <DashCard
            title={
              <span className="flex items-center gap-2">
                <Users className="size-4 text-sky-300" /> People
              </span>
            }
            action={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={internalOnly} onCheckedChange={setInternalOnly} /> Team only
              </label>
            }
            bodyClassName="px-0 pb-2 sm:px-0"
          >
            <PeopleTable people={d.by_person} />
          </DashCard>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <DashCard
              title="Top trackers"
              action={
                <Link href={ROUTES.pages.trackers} className="text-xs text-sky-300 hover:underline">
                  All trackers
                </Link>
              }
            >
              <TopTrackers items={d.top_trackers} />
            </DashCard>
            <DashCard title="Meeting load" action={<span className="text-[11px] text-muted-foreground">Day × hour (UTC)</span>}>
              <Heatmap cells={d.meeting_load} />
            </DashCard>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function InsightsSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[94px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

function WeeklyChart({ weeks }: { weeks: InsightsWeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxM = Math.max(1, ...weeks.map((w) => w.meetings));
  const maxH = Math.max(0.1, ...weeks.map((w) => w.hours));
  const ticks = niceTicks(maxM);
  const top = ticks[ticks.length - 1];
  const n = weeks.length;
  const points = weeks.map((w, i) => `${((i + 0.5) / n) * 100},${100 - (w.hours / maxH) * 92}`).join(" ");
  const h = hover != null ? weeks[hover] : null;

  if (n === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div>
      <div className="relative h-56">
        {/* grid */}
        <div className="absolute inset-0 left-7 flex flex-col-reverse justify-between">
          {ticks.map((t) => (
            <div key={t} className="relative border-t border-dashed border-white/[0.06]">
              <span className="absolute -left-7 -top-2 w-5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{t}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 left-7 flex items-end gap-[3px] sm:gap-1.5" onMouseLeave={() => setHover(null)}>
          {weeks.map((w, i) => (
            <button
              key={w.week_start}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`Week of ${shortDate(w.week_start)}: ${w.meetings} meetings, ${w.hours.toFixed(1)} hours`}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  "w-full max-w-9 rounded-t-md bg-gradient-to-t from-blue-600/70 to-blue-400 transition-opacity",
                  hover != null && hover !== i && "opacity-45",
                )}
                style={{ height: `${(w.meetings / top) * 100}%`, minHeight: w.meetings ? 3 : 0 }}
              />
            </button>
          ))}
        </div>
        <svg
          className="pointer-events-none absolute inset-0 left-7 h-full w-[calc(100%-1.75rem)] overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline points={points} fill="none" stroke="#6ee7b7" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0b1120]/95 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur"
            style={{ left: `calc(1.75rem + (100% - 1.75rem) * ${(hover + 0.5) / n})` }}
          >
            <p className="font-medium">Week of {shortDate(h.week_start)}</p>
            <p className="text-muted-foreground">
              {h.meetings} meetings · {h.hours.toFixed(1)} h · {h.external_meetings} external
            </p>
            {h.avg_talk_pct_me != null && <p className="text-muted-foreground">You talked {Math.round(h.avg_talk_pct_me)}%</p>}
          </div>
        )}
      </div>
      <div className="ml-7 mt-2 flex gap-[3px] sm:gap-1.5">
        {weeks.map((w, i) => (
          <span key={w.week_start} className="flex-1 truncate text-center font-mono text-[10px] text-muted-foreground">
            {n > 8 && i % Math.ceil(n / 6) !== 0 ? "" : shortDate(w.week_start)}
          </span>
        ))}
      </div>
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1; v += step) {
    out.push(v);
    if (v >= max) break;
  }
  return out;
}

function TypeMix({ types, total }: { types: InsightsResponse["by_type"]; total: number }) {
  const sorted = [...types].filter((t) => t.meetings > 0).sort((a, b) => b.meetings - a.meetings);
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">No meetings.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]">
        {sorted.map((t) => (
          <span
            key={t.meeting_type}
            title={`${MEETING_TYPE_LABELS[t.meeting_type]}: ${t.meetings}`}
            style={{ width: `${(t.meetings / Math.max(1, total)) * 100}%`, backgroundColor: TYPE_COLORS[t.meeting_type] }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {sorted.map((t) => (
          <li key={t.meeting_type} className="flex items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.meeting_type] }} />
            <span className="min-w-0 flex-1 truncate">{MEETING_TYPE_LABELS[t.meeting_type]}</span>
            <span className="font-mono text-xs tabular-nums text-white/80">{t.meetings}</span>
            <span className="w-14 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{t.hours.toFixed(1)} h</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SortKey = "meetings" | "avg_talk_pct" | "avg_questions" | "avg_longest_monologue_ms" | "avg_words_per_minute" | "avg_filler_per_100_words" | "avg_patience_ms";

const COLS: { key: SortKey; label: string; fmt: (p: PersonInsights) => string; color: string }[] = [
  { key: "meetings", label: "Calls", fmt: (p) => String(p.meetings), color: "#60a5fa" },
  { key: "avg_talk_pct", label: "Talk ratio", fmt: (p) => `${Math.round(p.avg_talk_pct)}%`, color: "#3b82f6" },
  { key: "avg_questions", label: "Questions / call", fmt: (p) => p.avg_questions.toFixed(1), color: "#fbbf24" },
  { key: "avg_longest_monologue_ms", label: "Longest monologue", fmt: (p) => fmtMs(p.avg_longest_monologue_ms), color: "#f472b6" },
  { key: "avg_words_per_minute", label: "Pace", fmt: (p) => `${Math.round(p.avg_words_per_minute)} wpm`, color: "#34d399" },
  { key: "avg_filler_per_100_words", label: "Fillers / 100w", fmt: (p) => p.avg_filler_per_100_words.toFixed(1), color: "#fb923c" },
  { key: "avg_patience_ms", label: "Patience", fmt: (p) => `${(p.avg_patience_ms / 1000).toFixed(1)}s`, color: "#a78bfa" },
];

function PeopleTable({ people }: { people: PersonInsights[] }) {
  const [sort, setSort] = useState<SortKey>("meetings");
  const max = useMemo(() => {
    const m = {} as Record<SortKey, number>;
    for (const c of COLS) m[c.key] = Math.max(1e-9, ...people.map((p) => p[c.key]));
    return m;
  }, [people]);
  const rows = useMemo(() => [...people].sort((a, b) => b[sort] - a[sort]), [people, sort]);
  if (people.length === 0) return <EmptyState icon={Users} title="No speakers in this range" />;
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            <th className="px-5 py-2 font-medium">Person</th>
            {COLS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => setSort(c.key)}
                  className={cn("uppercase tracking-[0.1em] hover:text-foreground", sort === c.key && "text-sky-300")}
                  aria-pressed={sort === c.key}
                >
                  {c.label}
                  {sort === c.key && " ↓"}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((p) => (
            <tr key={p.key} className="hover:bg-white/[0.02]">
              <td className="px-5 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <ParticipantAvatar person={p} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {p.is_external ? "External" : (p.email ?? "Team")}
                    </span>
                  </span>
                </span>
              </td>
              {COLS.map((c) => (
                <td key={c.key} className="w-[11%] px-3 py-2.5">
                  <span className="block font-mono text-xs tabular-nums text-white/85">{c.fmt(p)}</span>
                  <InlineBar frac={p[c.key] / max[c.key]} color={c.color} className="mt-1" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopTrackers({ items }: { items: InsightsResponse["top_trackers"] }) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Radar}
        title="No tracker mentions"
        description="Create trackers for competitors, pricing or security asks."
        action={
          <Link href={ROUTES.pages.trackers} className="text-sm text-sky-300 hover:underline">
            Set up trackers
          </Link>
        }
        className="py-6"
      />
    );
  const max = Math.max(1, ...items.map((t) => t.hits));
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t.tracker_id}>
          <Link href={ROUTES.pages.tracker(t.tracker_id)} className="group block">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="min-w-0 flex-1 truncate group-hover:text-sky-200">{t.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.hits}</span>
            </span>
            <InlineBar frac={t.hits / max} color={t.color} className="mt-1.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Heatmap({ cells }: { cells: InsightsResponse["meeting_load"] }) {
  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) m.set(`${c.day}-${c.hour}`, (m.get(`${c.day}-${c.hour}`) ?? 0) + c.meetings);
    return m;
  }, [cells]);
  const used = cells.filter((c) => c.meetings > 0).map((c) => c.hour);
  const lo = Math.min(8, ...used);
  const hi = Math.max(19, ...used);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const max = Math.max(1, ...cells.map((c) => c.meetings));
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <div className="inline-grid min-w-full gap-[3px]" style={{ gridTemplateColumns: `2.25rem repeat(${hours.length}, minmax(14px, 1fr))` }}>
        <span />
        {hours.map((h) => (
          <span key={h} className="text-center font-mono text-[9px] text-muted-foreground">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
        {DAYS.map((d, di) => (
          <HeatRow key={d} label={d} day={di} hours={hours} grid={grid} max={max} />
        ))}
      </div>
    </div>
  );
}

function HeatRow({ label, day, hours, grid, max }: { label: string; day: number; hours: number[]; grid: Map<string, number>; max: number }) {
  return (
    <>
      <span className="self-center text-[10px] text-muted-foreground">{label}</span>
      {hours.map((h) => {
        const v = grid.get(`${day}-${h}`) ?? 0;
        return (
          <span
            key={h}
            title={`${label} ${h}:00 UTC — ${v} meeting${v === 1 ? "" : "s"}`}
            className="aspect-square rounded-[3px]"
            style={{ backgroundColor: v ? `rgba(59,130,246,${0.25 + (v / max) * 0.75})` : "rgba(255,255,255,0.04)" }}
          />
        );
      })}
    </>
  );
}
