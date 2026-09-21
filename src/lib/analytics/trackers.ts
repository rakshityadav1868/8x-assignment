/** Keyword trackers (Phase 5 C). Pure. Owner: backend. */
import { escapeHtml } from "@/lib/search/text";
import type { MeetingDetail, Tracker, TrackerHit, TrackerWithStats } from "@/lib/types";

const SNIPPET_CHARS = 200;

/** Case-insensitive whole-word/phrase regex; words may be separated by any whitespace/punctuation. */
export function keywordRegex(keyword: string): RegExp | null {
  const parts = keyword
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join("[\\s\\p{P}]+")}(?![\\p{L}\\p{N}])`, "iu");
}

/** HTML-escaped text trimmed to ~SNIPPET_CHARS around [start, end) with the match in <mark>. */
export function markSnippet(text: string, start: number, end: number): string {
  let from = 0;
  let to = text.length;
  if (text.length > SNIPPET_CHARS) {
    const pad = Math.max(0, Math.floor((SNIPPET_CHARS - (end - start)) / 2));
    from = Math.max(0, start - pad);
    to = Math.min(text.length, end + pad);
    // snap to word boundaries
    if (from > 0) {
      const sp = text.indexOf(" ", from);
      if (sp !== -1 && sp < start) from = sp + 1;
    }
    if (to < text.length) {
      const sp = text.lastIndexOf(" ", to);
      if (sp > end) to = sp;
    }
  }
  return (
    (from > 0 ? "… " : "") +
    escapeHtml(text.slice(from, start)) +
    "<mark>" +
    escapeHtml(text.slice(start, end)) +
    "</mark>" +
    escapeHtml(text.slice(end, to)) +
    (to < text.length ? " …" : "")
  );
}

const detailDate = (d: MeetingDetail) => d.meeting.recording_start ?? d.meeting.scheduled_start ?? d.meeting.created_at ?? null;

function hitsInMeeting(tracker: Tracker, detail: MeetingDetail): TrackerHit[] {
  const res = tracker.keywords
    .map((k) => ({ keyword: k, re: keywordRegex(k) }))
    .filter((x): x is { keyword: string; re: RegExp } => !!x.re);
  if (!res.length) return [];
  const people = new Map(detail.participants.map((p) => [p.id, p]));
  const date = detailDate(detail);
  const out: TrackerHit[] = [];
  for (const s of detail.segments) {
    const seen = new Set<string>();
    for (const { keyword, re } of res) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      const m = re.exec(s.text);
      if (!m) continue;
      seen.add(key);
      const p = s.participant_id ? people.get(s.participant_id) : undefined;
      out.push({
        tracker_id: tracker.id,
        keyword,
        meeting_id: detail.meeting.id,
        meeting_title: detail.meeting.title,
        meeting_date: date,
        segment_id: s.id,
        participant_id: s.participant_id,
        speaker_name: p?.name ?? "Unknown speaker",
        speaker_color: p?.color ?? null,
        start_ms: s.start_ms,
        snippet: markSnippet(s.text, m.index, m.index + m[0].length),
      });
    }
  }
  return out;
}

const time = (s: string | null) => (s ? Date.parse(s) || 0 : 0);

/**
 * Find every occurrence of any tracker keyword in segment text: case-insensitive, whole-word/phrase match
 * (punctuation-tolerant), one hit per (segment, keyword). Snippet = HTML-escaped segment text (trimmed to
 * ~200 chars around the match) with the match wrapped in <mark>. Ordered by meeting date desc, then start_ms.
 */
export function findTrackerHits(tracker: Tracker, details: MeetingDetail[]): TrackerHit[] {
  const hits = details.flatMap((d) => hitsInMeeting(tracker, d));
  return hits.sort(
    (a, b) => time(b.meeting_date) - time(a.meeting_date) || a.meeting_id.localeCompare(b.meeting_id) || a.start_ms - b.start_ms,
  );
}

/** Hits for all trackers inside one meeting, ordered by start_ms (call-page timeline markers). */
export function findMeetingTrackerHits(trackers: Tracker[], detail: MeetingDetail): TrackerHit[] {
  return trackers.flatMap((t) => hitsInMeeting(t, detail)).sort((a, b) => a.start_ms - b.start_ms || a.tracker_id.localeCompare(b.tracker_id));
}

/** hit_count, meeting_count, last_hit_at for the tracker list. */
export function withTrackerStats(tracker: Tracker, hits: TrackerHit[]): TrackerWithStats {
  const own = hits.filter((h) => h.tracker_id === tracker.id);
  let last: string | null = null;
  for (const h of own) if (h.meeting_date && (!last || time(h.meeting_date) > time(last))) last = h.meeting_date;
  return {
    ...tracker,
    hit_count: own.length,
    meeting_count: new Set(own.map((h) => h.meeting_id)).size,
    last_hit_at: last,
  };
}
