/** Library filtering/sorting for GET /api/meetings (Phase 5 A). Pure + isomorphic. Owner: backend. */
import type { MeetingListFilters, MeetingListItem } from "@/lib/types";

/**
 * Apply MeetingListFilters (AND semantics) and sort (default "newest" by recording_start ?? scheduled_start ??
 * created_at). `trash: true` returns only deleted items; otherwise deleted items are excluded. `folder_id: "none"`
 * = no folder. `scope: "all"`/undefined = no scope filter. `q` matches title or participant name/email;
 * `participant` matches name or email; `company` matches company_domain; from/to compare dates inclusively.
 */
export function filterMeetings(items: MeetingListItem[], filters: MeetingListFilters): MeetingListItem[] {
  void items;
  void filters;
  throw new Error("TODO");
}
