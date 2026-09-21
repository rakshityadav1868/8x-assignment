/** Slack incoming-webhook posting — REAL (Phase 5 D). Server-only. Owner: backend. */
import "server-only";
import { ROUTES } from "@/lib/routes";
import { formatClockMs, formatExportDate, meetingDateIso } from "@/lib/export/transcript";
import type { MeetingDetail, SlackConfig, SlackConfigView, Summary } from "@/lib/types";

export const SLACK_TIMEOUT_MS = 8000;
const SECTION_LIMIT = 2900; // Slack caps section text at 3000 chars

/** Slack mrkdwn escaping (&, <, >). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, n = SECTION_LIMIT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** True for https://hooks.slack.com/... (the only host we ever POST to). */
export function isSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && !u.username && !u.password && (!u.port || u.port === "443");
  } catch {
    return false;
  }
}

/** Slack mrkdwn recap text (title link, summary bullets w/ timestamp links, action items, highlights per config). */
export function buildSlackRecap(
  detail: MeetingDetail,
  summary: Summary | null,
  config: Pick<SlackConfig, "include_summary" | "include_action_items" | "include_highlights">,
  opts: { origin: string; note?: string },
): { text: string; blocks: unknown[] } {
  const origin = opts.origin.replace(/\/+$/, "");
  const m = detail.meeting;
  const callUrl = `${origin}${ROUTES.pages.call(m.id)}`;
  const at = (ms: number) => `<${origin}${ROUTES.pages.callAt(m.id, ms)}|${formatClockMs(ms)}>`;
  const names = new Map(detail.participants.map((p) => [p.id, p.name]));
  const date = formatExportDate(meetingDateIso(m));
  const meta = [date, m.duration_sec ? `${Math.round(m.duration_sec / 60)} min` : "", detail.participants.map((p) => p.name).join(", ")]
    .filter(Boolean)
    .join(" · ");

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: clip(`📼 ${m.title}`, 150), emoji: true } },
  ];
  if (meta) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: clip(esc(meta), 2000) }] });
  const text: string[] = [`*<${callUrl}|${esc(m.title)}>*`, meta ? esc(meta) : ""];
  if (opts.note?.trim()) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(esc(opts.note.trim())) } });
    text.push("", esc(opts.note.trim()));
  }

  if (config.include_summary) {
    if (summary && summary.sections.some((s) => s.bullets.length)) {
      for (const sec of summary.sections) {
        if (!sec.bullets.length) continue;
        const body = `*${esc(sec.heading)}*\n${sec.bullets.map((b) => `• ${esc(b.text)} ${at(b.start_ms)}`).join("\n")}`;
        blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(body) } });
        text.push("", body);
      }
    } else {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: "_No summary has been generated yet._" } });
    }
  }

  if (config.include_action_items && detail.action_items.length) {
    const body = `*Action items*\n${detail.action_items
      .map((a) => {
        const who = a.assignee_participant_id ? names.get(a.assignee_participant_id) : null;
        return `${a.completed ? "☑︎" : "☐"} ${esc(a.description)}${who ? ` — _${esc(who)}_` : ""}${a.timestamp_ms != null ? ` ${at(a.timestamp_ms)}` : ""}`;
      })
      .join("\n")}`;
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: clip(body) } });
    text.push("", body);
  }

  if (config.include_highlights && detail.highlights.length) {
    const body = `*Highlights*\n${detail.highlights
      .map((h) => `• <${origin}${ROUTES.pages.clip(h.share_token)}|${esc(h.title)}> ${at(h.start_ms)}`)
      .join("\n")}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: clip(body) } });
    text.push("", body);
  }

  blocks.push({
    type: "actions",
    elements: [{ type: "button", text: { type: "plain_text", text: "Open in Fanthom" }, url: callUrl, style: "primary" }],
  });
  // Slack allows at most 50 blocks per message.
  const capped = blocks.length > 50 ? [...blocks.slice(0, 49), blocks[blocks.length - 1]] : blocks;
  return { text: clip(text.filter((l, i) => l || i > 1).join("\n"), 3900), blocks: capped };
}

/** POST {text, blocks} to the webhook URL (8s timeout, host must be hooks.slack.com, no redirects). Never throws. */
export async function postToSlack(
  webhookUrl: string,
  message: { text: string; blocks?: unknown[] },
): Promise<{ ok: boolean; status_code: number | null; error: string | null }> {
  if (!isSlackWebhookUrl(webhookUrl)) {
    return { ok: false, status_code: null, error: "Slack webhook URL must start with https://hooks.slack.com/" };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", "User-Agent": "Fanthom-Slack/1.0" },
      body: JSON.stringify(message),
    });
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.ok) return { ok: true, status_code: res.status, error: null };
    return { ok: false, status_code: res.status, error: `Slack responded ${res.status}${body ? `: ${body}` : ""}` };
  } catch (err) {
    const e = err as Error;
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, status_code: null, error: timeout ? `Slack did not respond within ${SLACK_TIMEOUT_MS / 1000}s` : `Network error: ${e?.message ?? "request failed"}` };
  }
}

/** "https://hooks.slack.com/services/T0…/…abcd" */
export function maskSlackUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // services, T…, B…, secret
    const first = parts[1] ? `${parts[1].slice(0, 2)}…` : "…";
    const last = parts[parts.length - 1] ?? "";
    return `${u.origin}/${parts[0] ?? "services"}/${first}/…${last.slice(-4)}`;
  } catch {
    return "https://hooks.slack.com/…";
  }
}

/** Strip the secret URL for API responses. */
export function toSlackConfigView(config: SlackConfig): SlackConfigView {
  const { webhook_url, ...rest } = config;
  return { ...rest, connected: !!webhook_url, webhook_url_masked: webhook_url ? maskSlackUrl(webhook_url) : null };
}
