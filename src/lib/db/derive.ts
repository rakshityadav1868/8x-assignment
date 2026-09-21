/**
 * Small pure helpers shared by both repositories (Phase 5). Kept inside the db layer on purpose so list/calendar
 * reads never depend on analytics code owned by other agents. Semantics match the JSDoc in
 * src/lib/analytics/{deals,calendar}.ts.
 */
import type {
  AutoRecordRule,
  CalendarEvent,
  MeetingListItem,
  Participant,
  ShareScope,
  SlackConfig,
  User,
  UserPrefs,
} from "@/lib/types";
import type { StoredCalendarEvent } from "./seed-types";

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "aol.com"]);

export function domainOf(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at < 0) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return d || null;
}

/** "acme-logistics.co.uk" → "Acme Logistics". */
export function nameFromDomain(domain: string): string {
  const label = domain.toLowerCase().split(".")[0] ?? domain;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Most frequent external company domain (non-workspace, non-free-mail); ties → first by participant name. */
export function primaryDomain(participants: Pick<Participant, "email" | "is_external" | "name">[], workspaceDomain: string): string | null {
  const counts = new Map<string, { n: number; first: string }>();
  for (const p of [...participants].sort((a, b) => a.name.localeCompare(b.name))) {
    const d = domainOf(p.email);
    if (!p.is_external || !d || d === workspaceDomain.toLowerCase() || FREE_MAIL.has(d)) continue;
    const c = counts.get(d);
    if (c) c.n++;
    else counts.set(d, { n: 1, first: p.name });
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, c] of counts) if (c.n > bestN) [best, bestN] = [d, c.n];
  return best;
}

/** Library tab of a meeting for `user`: recorder (or no recorder = own upload) → mine; invited → shared; else team. */
export function scopeOf(recordedBy: string | null | undefined, invitedEmails: string[] | null | undefined, user: Pick<User, "name" | "email">): ShareScope {
  if (!recordedBy || recordedBy.trim().toLowerCase() === user.name.toLowerCase()) return "mine";
  const me = user.email.toLowerCase();
  if ((invitedEmails ?? []).some((e) => e.toLowerCase() === me)) return "shared";
  return "team";
}

/** Fills the Phase 5 list-item fields. */
export function withLibraryFields(
  item: Omit<MeetingListItem, "scope" | "company_domain" | "company_name" | "comment_count">,
  ctx: {
    invited: string[] | null | undefined;
    user: Pick<User, "name" | "email">;
    workspaceDomain: string;
    commentCount: number;
    companyNames: Map<string, string>;
  },
): MeetingListItem {
  const domain = primaryDomain(item.participants, ctx.workspaceDomain);
  return {
    ...item,
    folder_id: item.folder_id ?? null,
    starred: item.starred ?? false,
    deleted_at: item.deleted_at ?? null,
    recorded_by: item.recorded_by ?? null,
    scope: scopeOf(item.recorded_by, ctx.invited, ctx.user),
    company_domain: domain,
    company_name: domain ? (ctx.companyNames.get(domain) ?? nameFromDomain(domain)) : null,
    comment_count: ctx.commentCount,
  };
}

export function ruleRecords(isExternal: boolean, rule: AutoRecordRule): boolean {
  return rule === "all" ? true : rule === "none" ? false : rule === "external_only" ? isExternal : !isExternal;
}

export function toCalendarEvent(e: StoredCalendarEvent, rule: AutoRecordRule): CalendarEvent {
  return { ...e, record: e.record_override ?? ruleRecords(e.is_external, rule) };
}

/** Inclusive range check; bare "yyyy-mm-dd" `to` covers the whole day. */
export function overlaps(e: { start: string; end: string }, range: { from: string; to: string }): boolean {
  const from = Date.parse(range.from);
  let to = Date.parse(range.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(range.to.trim())) to += 86_400_000 - 1;
  return (Number.isNaN(to) || Date.parse(e.start) <= to) && (Number.isNaN(from) || Date.parse(e.end) >= from);
}

export function defaultPrefs(userId: string, now: string): UserPrefs {
  return {
    user_id: userId,
    default_template: "general",
    default_language: "en",
    default_share_access: "anyone_with_link",
    auto_record_rule: "all",
    email_recap_enabled: true,
    notify_meeting_ready: true,
    notify_mentions: true,
    notify_shared: true,
    calendar_connected: false,
    onboarding_completed: false,
    updated_at: now,
  };
}

export function defaultSlackConfig(workspaceId: string, now: string): SlackConfig {
  return {
    workspace_id: workspaceId,
    webhook_url: null,
    channel_label: null,
    auto_post_on_ready: false,
    include_summary: true,
    include_action_items: true,
    include_highlights: false,
    updated_at: now,
  };
}

/** "jane.doe@x.com" → "Jane Doe" (invites carry no name). */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export const MEMBER_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#a3e635", "#e879f9"];

/** Comments: timestamp_ms asc (nulls last), then created_at. */
export function commentOrder(a: { timestamp_ms: number | null; created_at: string }, b: { timestamp_ms: number | null; created_at: string }): number {
  const ta = a.timestamp_ms ?? Infinity;
  const tb = b.timestamp_ms ?? Infinity;
  return ta === tb ? a.created_at.localeCompare(b.created_at) : ta - tb;
}
