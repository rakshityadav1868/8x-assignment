/** Library filtering/sorting for GET /api/meetings (Phase 5 A). Pure + isomorphic. Owner: backend. */
import type { MeetingListFilters, MeetingListItem } from "@/lib/types";

/** The date a meeting is filed under: recording_start ?? scheduled_start ?? created_at. */
export function meetingDate(m: Pick<MeetingListItem, "recording_start" | "scheduled_start" | "created_at">): string {
  return m.recording_start ?? m.scheduled_start ?? m.created_at;
}

const ts = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
};

/** Inclusive date bound: a bare "yyyy-mm-dd" `to` covers the whole day. */
function bound(value: string, end: boolean): number | null {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return t + 86_400_000 - 1;
  return t;
}

/**
 * Apply MeetingListFilters (AND semantics) and sort (default "newest" by recording_start ?? scheduled_start ??
 * created_at). `trash: true` returns only deleted items; otherwise deleted items are excluded. `folder_id: "none"`
 * = no folder. `scope: "all"`/undefined = no scope filter. `q` matches title or participant name/email;
 * `participant` matches name or email; `company` matches company_domain; from/to compare dates inclusively.
 */
export function filterMeetings(items: MeetingListItem[], filters: MeetingListFilters): MeetingListItem[] {
  const f = filters;
  const q = f.q?.trim().toLowerCase() || null;
  const participant = f.participant?.trim().toLowerCase() || null;
  const company = f.company?.trim().toLowerCase() || null;
  const from = f.from ? bound(f.from, false) : null;
  const to = f.to ? bound(f.to, true) : null;

  const out = items.filter((m) => {
    const deleted = !!m.deleted_at;
    if (f.trash ? !deleted : deleted) return false;
    if (f.scope && f.scope !== "all" && m.scope !== f.scope) return false;
    if (f.folder_id) {
      if (f.folder_id === "none" ? !!m.folder_id : m.folder_id !== f.folder_id) return false;
    }
    if (f.meeting_type && m.meeting_type !== f.meeting_type) return false;
    if (f.has_action_items !== undefined && (m.action_item_count > 0) !== f.has_action_items) return false;
    if (f.starred !== undefined && !!m.starred !== f.starred) return false;
    if (company && (m.company_domain ?? "").toLowerCase() !== company && !(m.company_name ?? "").toLowerCase().includes(company))
      return false;
    if (participant) {
      const hit = m.participants.some(
        (p) => p.name.toLowerCase().includes(participant) || (p.email ?? "").toLowerCase() === participant || (p.email ?? "").toLowerCase().includes(participant),
      );
      if (!hit) return false;
    }
    if (q) {
      const hit =
        m.title.toLowerCase().includes(q) ||
        m.participants.some((p) => p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (from != null || to != null) {
      const d = ts(meetingDate(m));
      if (from != null && d < from) return false;
      if (to != null && d > to) return false;
    }
    return true;
  });

  const sort = f.sort ?? "newest";
  const byDate = (a: MeetingListItem, b: MeetingListItem) => ts(meetingDate(b)) - ts(meetingDate(a));
  out.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return -byDate(a, b) || a.title.localeCompare(b.title);
      case "longest":
        return b.duration_sec - a.duration_sec || byDate(a, b);
      case "shortest":
        return a.duration_sec - b.duration_sec || byDate(a, b);
      case "title":
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || byDate(a, b);
      default:
        return byDate(a, b) || a.title.localeCompare(b.title);
    }
  });
  return out;
}
