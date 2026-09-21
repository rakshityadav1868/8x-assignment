/** Team insights dashboard (Phase 5 C). Pure. Owner: backend. */
import type { InsightsRange, InsightsSummary, MeetingDetail, MeetingType, PersonInsights, Tracker, User } from "@/lib/types";
import { computeCoachingMetrics } from "./coaching";
import { findTrackerHits } from "./trackers";

export interface InsightsContext {
  range: InsightsRange;
  now: Date;
  me: User; // for weekly.avg_talk_pct_me
  workspace_domain: string; // internal = email domain matches
  trackers: Tracker[]; // for top_trackers (uses analytics/trackers.ts)
  internal_only?: boolean;
}

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<Exclude<InsightsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function dateOf(d: MeetingDetail): Date {
  const s = d.meeting.recording_start ?? d.meeting.scheduled_start ?? d.meeting.created_at;
  const t = Date.parse(s);
  return new Date(Number.isNaN(t) ? 0 : t);
}

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStartUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** Range start for a range key (null for "all"). */
export function rangeStart(range: InsightsRange, now: Date): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS);
}

interface PersonAcc {
  key: string;
  name: string;
  email: string | null;
  color: string;
  is_external: boolean;
  meetings: Set<string>;
  total_talk_ms: number;
  talk_pct: number[];
  wpm: number[];
  questions: number[];
  filler: number[];
  monologue: number[];
  patience: number[];
  interruptions: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);

/**
 * Aggregate across ready, non-deleted meetings whose date (recording_start ?? scheduled_start ?? created_at)
 * falls in range. Uses computeCoachingMetrics per meeting; persons are keyed by lowercased email (else name).
 * weekly buckets start Monday (UTC), oldest first, including empty weeks within range ("all" = since first meeting).
 * meeting_load counts meeting starts by (UTC weekday Mon=0, hour) — full 7×24 grid. top_trackers: top 5 by hits.
 */
export function computeInsights(details: MeetingDetail[], ctx: InsightsContext): InsightsSummary {
  const from = rangeStart(ctx.range, ctx.now);
  const nowT = ctx.now.getTime();
  const inRange = details
    .filter((d) => d.meeting.status === "ready" && !d.meeting.deleted_at)
    .filter((d) => {
      const t = dateOf(d).getTime();
      return (from == null || t >= from.getTime()) && t <= nowT;
    })
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime());

  const domain = ctx.workspace_domain.toLowerCase();
  const meEmail = ctx.me.email.toLowerCase();
  const isExternal = (p: { email: string | null; is_external: boolean }) => {
    if (p.email) {
      const dom = p.email.toLowerCase().split("@")[1];
      if (dom) return dom !== domain;
    }
    return p.is_external;
  };

  // Weekly buckets.
  const firstWeek = weekStartUtc(from ?? (inRange.length ? dateOf(inRange[0]) : ctx.now));
  const lastWeek = weekStartUtc(ctx.now);
  const weekly = new Map<string, InsightsSummary["weekly"][number] & { talk: number[] }>();
  for (let t = firstWeek.getTime(); t <= lastWeek.getTime(); t += 7 * DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    weekly.set(key, { week_start: key, meetings: 0, hours: 0, external_meetings: 0, avg_talk_pct_me: null, questions: 0, talk: [] });
  }

  const load = new Map<string, number>();
  const byType = new Map<MeetingType, { meetings: number; hours: number }>();
  const people = new Map<string, PersonAcc>();
  const totals = { meetings: 0, hours_recorded: 0, avg_duration_min: 0, external_meetings: 0, action_items: 0, open_action_items: 0, highlights: 0 };

  for (const d of inRange) {
    const date = dateOf(d);
    const hours = (d.meeting.duration_sec || 0) / 3600;
    const external = d.participants.some(isExternal);
    const metrics = computeCoachingMetrics(d);

    totals.meetings += 1;
    totals.hours_recorded += hours;
    if (external) totals.external_meetings += 1;
    totals.action_items += d.action_items.length;
    totals.open_action_items += d.action_items.filter((a) => !a.completed).length;
    totals.highlights += d.highlights.length;

    const wk = weekly.get(weekStartUtc(date).toISOString().slice(0, 10));
    if (wk) {
      wk.meetings += 1;
      wk.hours += hours;
      if (external) wk.external_meetings += 1;
      wk.questions += metrics.questions_asked;
    }

    const loadKey = `${(date.getUTCDay() + 6) % 7}:${date.getUTCHours()}`;
    load.set(loadKey, (load.get(loadKey) ?? 0) + 1);

    const bt = byType.get(d.meeting.meeting_type) ?? { meetings: 0, hours: 0 };
    bt.meetings += 1;
    bt.hours += hours;
    byType.set(d.meeting.meeting_type, bt);

    const partById = new Map(d.participants.map((p) => [p.id, p]));
    for (const s of metrics.speakers) {
      const p = partById.get(s.participant_id);
      const email = p?.email?.toLowerCase() ?? null;
      const key = email ?? s.name.toLowerCase();
      if (wk && (email === meEmail || (!email && s.name === ctx.me.name))) wk.talk.push(s.talk_pct);
      let acc = people.get(key);
      if (!acc) {
        acc = {
          key,
          name: s.name,
          email,
          color: s.color,
          is_external: p ? isExternal(p) : s.is_external,
          meetings: new Set(),
          total_talk_ms: 0,
          talk_pct: [],
          wpm: [],
          questions: [],
          filler: [],
          monologue: [],
          patience: [],
          interruptions: 0,
        };
        people.set(key, acc);
      }
      acc.meetings.add(d.meeting.id);
      acc.total_talk_ms += s.talk_ms;
      acc.talk_pct.push(s.talk_pct);
      acc.wpm.push(s.words_per_minute);
      acc.questions.push(s.questions_asked);
      acc.filler.push(s.filler_per_100_words);
      acc.monologue.push(s.longest_monologue_ms);
      if (s.avg_patience_ms > 0) acc.patience.push(s.avg_patience_ms);
      acc.interruptions += s.interruptions;
    }
  }

  totals.avg_duration_min = totals.meetings ? round1((totals.hours_recorded * 60) / totals.meetings) : 0;
  totals.hours_recorded = round1(totals.hours_recorded);

  const by_person: PersonInsights[] = [...people.values()]
    .filter((p) => !(ctx.internal_only && p.is_external))
    .map((p) => ({
      key: p.key,
      name: p.name,
      email: p.email,
      color: p.color,
      is_external: p.is_external,
      meetings: p.meetings.size,
      total_talk_ms: p.total_talk_ms,
      avg_talk_pct: round1(avg(p.talk_pct)),
      avg_words_per_minute: Math.round(avg(p.wpm)),
      avg_questions: round1(avg(p.questions)),
      avg_filler_per_100_words: round2(avg(p.filler)),
      avg_longest_monologue_ms: Math.round(avg(p.monologue)),
      avg_patience_ms: Math.round(avg(p.patience)),
      total_interruptions: p.interruptions,
    }))
    .sort((a, b) => Number(a.is_external) - Number(b.is_external) || b.meetings - a.meetings || b.total_talk_ms - a.total_talk_ms || a.name.localeCompare(b.name));

  const meeting_load: InsightsSummary["meeting_load"] = [];
  for (let day = 0; day < 7; day++) for (let hour = 0; hour < 24; hour++) meeting_load.push({ day, hour, meetings: load.get(`${day}:${hour}`) ?? 0 });

  const top_trackers = ctx.trackers
    .map((t) => ({ tracker_id: t.id, name: t.name, color: t.color, hits: findTrackerHits(t, inRange).length }))
    .filter((t) => t.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    range: ctx.range,
    from: from ? from.toISOString() : inRange.length ? dateOf(inRange[0]).toISOString() : null,
    to: ctx.now.toISOString(),
    totals,
    weekly: [...weekly.values()].map(({ talk, ...w }) => ({
      ...w,
      hours: round2(w.hours),
      avg_talk_pct_me: talk.length ? round1(avg(talk)) : null,
    })),
    by_person,
    by_type: [...byType.entries()]
      .map(([meeting_type, v]) => ({ meeting_type, meetings: v.meetings, hours: round2(v.hours) }))
      .sort((a, b) => b.meetings - a.meetings || b.hours - a.hours),
    meeting_load,
    top_trackers,
  };
}
