/** Slack incoming-webhook posting — REAL (Phase 5 D). Server-only. Owner: backend. */
import "server-only";
import type { MeetingDetail, SlackConfig, SlackConfigView, Summary } from "@/lib/types";

/** Slack mrkdwn recap text (title link, summary bullets w/ timestamp links, action items, highlights per config). */
export function buildSlackRecap(
  detail: MeetingDetail,
  summary: Summary | null,
  config: Pick<SlackConfig, "include_summary" | "include_action_items" | "include_highlights">,
  opts: { origin: string; note?: string },
): { text: string; blocks: unknown[] } {
  void detail;
  void summary;
  void config;
  void opts;
  throw new Error("TODO");
}

/** POST {text, blocks} to the webhook URL (8s timeout). Never throws. */
export async function postToSlack(
  webhookUrl: string,
  message: { text: string; blocks?: unknown[] },
): Promise<{ ok: boolean; status_code: number | null; error: string | null }> {
  void webhookUrl;
  void message;
  throw new Error("TODO");
}

/** Strip the secret URL for API responses. */
export function toSlackConfigView(config: SlackConfig): SlackConfigView {
  void config;
  throw new Error("TODO");
}
