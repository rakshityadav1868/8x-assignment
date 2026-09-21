/** Summary / recap exporters (Phase 5 D). Pure. Owner: backend. */
import type { EmailRecap, MeetingDetail, Summary } from "@/lib/types";

/** Markdown with title, date, participants, summary sections (bullets link to `${callUrl}?t=sec` when given), action items, highlights. */
export function summaryToMarkdown(detail: MeetingDetail, summary: Summary | null, callUrl?: string): string {
  void detail;
  void summary;
  void callUrl;
  throw new Error("TODO");
}

/** Email recap preview (HTML inline-styled + plain text). Recipients per `recipients` filter on participant emails. */
export function buildEmailRecap(
  detail: MeetingDetail,
  summary: Summary | null,
  opts: { callUrl: string; include_action_items: boolean; include_highlights: boolean; recipients: "all" | "internal" | "external" },
): EmailRecap {
  void detail;
  void summary;
  void opts;
  throw new Error("TODO");
}
